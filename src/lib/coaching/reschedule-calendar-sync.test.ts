import { describe, expect, it, vi } from 'vitest'
import {
  CALENDAR_RESCHEDULE_MAX_PATCH_ATTEMPTS,
  runCalendarRescheduleSync,
  type CalendarBookingSnapshot,
  type CalendarRescheduleSyncDeps,
} from '@/lib/coaching/reschedule-calendar-sync'
import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'

function baseSnap(over: Partial<CalendarBookingSnapshot> = {}): CalendarBookingSnapshot {
  return {
    status: 'scheduled',
    slotId: 'slot-B',
    scheduleRevision: 'rev-2',
    coachId: 'coach-1',
    studentId: 'student-1',
    studentNote: 'note',
    startsAt: '2026-09-10T01:00:00.000Z',
    endsAt: '2026-09-10T01:50:00.000Z',
    googleCalendarEventId: 'evt-1',
    googleCalendarEtag: 'etag-0',
    ...over,
  }
}

const BOOKING_ID = '11111111-1111-1111-1111-111111111111'


function makeDeps(over: Partial<CalendarRescheduleSyncDeps> = {}): CalendarRescheduleSyncDeps {
  return {
    loadBooking: vi.fn(async () => baseSnap()),
    persistMeta: vi.fn(async () => 'ok' as const),
    updateEvent: vi.fn(async () => ({ status: 'updated' as const, etag: 'etag-new' })),
    fetchEvent: vi.fn(async () => ({
      status: 'ok' as const,
      etag: 'etag-fresh',
      summary: '【コーチング】x',
      eventStatus: 'confirmed',
      privateBookingId: null,
    })),
    createEvent: vi.fn(async (input) => ({
      eventId: coachingBookingCalendarEventId(
        'bookingId' in input && typeof (input as { bookingId?: string }).bookingId === 'string'
          ? (input as { bookingId: string }).bookingId
          : BOOKING_ID,
      ),
      etag: 'etag-created',
    })),
    deleteEvent: vi.fn(async () => undefined),
    isConfigured: () => true,
    ...over,
  }
}

describe('runCalendarRescheduleSync', () => {
  it('after older writer wins first, latest revision recovers via 412 then If-Match retry', async () => {
    // Change① and ② both started from etag-0. ① patches first; ② is latest (rev-2).
    let storedEtag: string | null = 'etag-0'
    const loadBooking = vi.fn<CalendarRescheduleSyncDeps['loadBooking']>(async () =>
      baseSnap({ scheduleRevision: 'rev-2', googleCalendarEtag: storedEtag }),
    )

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValueOnce({ status: 'precondition_failed' })
      .mockResolvedValueOnce({ status: 'updated', etag: 'etag-2' })

    const fetchEvent = vi
      .fn<CalendarRescheduleSyncDeps['fetchEvent']>()
      .mockResolvedValue({
        status: 'ok',
        etag: 'etag-1',
        summary: null,
        eventStatus: 'confirmed',
        privateBookingId: null,
      })

    const persistMeta = vi.fn<CalendarRescheduleSyncDeps['persistMeta']>(async (p) => {
      storedEtag = p.etag
      return 'ok'
    })

    const deps = makeDeps({ loadBooking, updateEvent, fetchEvent, persistMeta })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('updated')
    expect(updateEvent).toHaveBeenCalledTimes(2)
    expect(updateEvent.mock.calls[0][0].ifMatchEtag).toBe('etag-0')
    expect(updateEvent.mock.calls[1][0].ifMatchEtag).toBe('etag-1')
    expect(updateEvent.mock.calls[1][0].startsAt).toBe('2026-09-10T01:00:00.000Z')
    expect(persistMeta).toHaveBeenCalledWith(
      expect.objectContaining({ changeRevision: 'rev-2', etag: 'etag-2' }),
    )
  })

  it('exits on 412 when this revision is no longer latest (older writer)', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(
        baseSnap({ scheduleRevision: 'rev-1', googleCalendarEtag: 'etag-0', startsAt: 'old' }),
      )
      .mockResolvedValueOnce(
        baseSnap({ scheduleRevision: 'rev-1', googleCalendarEtag: 'etag-0', startsAt: 'old' }),
      )
      .mockResolvedValueOnce(
        // After 412: DB already advanced to rev-2
        baseSnap({ scheduleRevision: 'rev-2', googleCalendarEtag: 'etag-1', startsAt: 'new' }),
      )

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'precondition_failed' })

    const deps = makeDeps({ loadBooking, updateEvent })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-1', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('skipped_stale')
    expect(updateEvent).toHaveBeenCalledTimes(1)
    expect(deps.fetchEvent).not.toHaveBeenCalled()
  })

  it('returns failed (not skipped) when etag CAS persist fails after a successful patch', async () => {
    const deps = makeDeps({
      persistMeta: vi.fn(async (): Promise<'ok' | 'stale' | 'failed'> => 'failed'),
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('failed')
  })

  it('returns skipped_stale when etag CAS loses because revision moved', async () => {
    const deps = makeDeps({
      persistMeta: vi.fn(async (): Promise<'ok' | 'stale' | 'failed'> => 'stale'),
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('skipped_stale')
  })

  it('fetches etag before patch when DB has no etag (never unconditional patch)', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValue(
        baseSnap({ googleCalendarEtag: null, scheduleRevision: 'rev-2' }),
      )

    const fetchEvent = vi
      .fn<CalendarRescheduleSyncDeps['fetchEvent']>()
      .mockResolvedValue({
        status: 'ok',
        etag: 'etag-from-get',
        summary: null,
        eventStatus: 'confirmed',
        privateBookingId: null,
      })

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'updated', etag: 'etag-after' })

    const deps = makeDeps({ loadBooking, fetchEvent, updateEvent })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('updated')
    expect(fetchEvent).toHaveBeenCalledWith('evt-1')
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ ifMatchEtag: 'etag-from-get' }),
    )
  })

  it('clears google_calendar_event_id with CAS matchEventId on 404 (missing etag path)', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValue(baseSnap({ googleCalendarEtag: null, scheduleRevision: 'rev-2' }))

    const fetchEvent = vi
      .fn<CalendarRescheduleSyncDeps['fetchEvent']>()
      .mockResolvedValue({ status: 'not_found' as const })

    const persistMeta = vi.fn<CalendarRescheduleSyncDeps['persistMeta']>().mockResolvedValue('failed')

    const deps = makeDeps({
      loadBooking,
      fetchEvent,
      persistMeta,
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('failed')
    expect(fetchEvent).toHaveBeenCalledTimes(1)
    const refreshed = await fetchEvent.mock.results[0].value
    expect(refreshed).toEqual({ status: 'not_found' })
  })

  it('clears google_calendar_event_id with CAS matchEventId on 404 (post-412 path)', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(baseSnap({ googleCalendarEtag: 'etag-0', scheduleRevision: 'rev-2' }))
      .mockResolvedValueOnce(baseSnap({ googleCalendarEtag: 'etag-1', scheduleRevision: 'rev-2' }))

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'precondition_failed' })

    const fetchEvent = vi
      .fn<CalendarRescheduleSyncDeps['fetchEvent']>()
      .mockResolvedValue({ status: 'not_found' as const })

    const persistMeta = vi.fn<CalendarRescheduleSyncDeps['persistMeta']>().mockResolvedValue('failed')

    const deps = makeDeps({
      loadBooking,
      updateEvent,
      fetchEvent,
      persistMeta,
    })

    expect(deps.persistMeta).toBe(persistMeta)

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('failed')
  })

  it('aborts after GET when a newer reschedule landed mid-flight', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(baseSnap({ googleCalendarEtag: null, scheduleRevision: 'rev-2' }))
      .mockResolvedValueOnce(baseSnap({ googleCalendarEtag: null, scheduleRevision: 'rev-2' }))
      .mockResolvedValueOnce(baseSnap({ scheduleRevision: 'rev-3', googleCalendarEtag: null }))

    const fetchEvent = vi
      .fn<CalendarRescheduleSyncDeps['fetchEvent']>()
      .mockResolvedValue({
        status: 'ok',
        etag: 'etag-x',
        summary: null,
        eventStatus: 'confirmed',
        privateBookingId: null,
      })

    const updateEvent = vi.fn<CalendarRescheduleSyncDeps['updateEvent']>()

    const deps = makeDeps({ loadBooking, fetchEvent, updateEvent })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('skipped_stale')
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('uses DB snapshot times on 412 retry so an older in-memory schedule is not written back', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValue(
        baseSnap({
          scheduleRevision: 'rev-2',
          googleCalendarEtag: 'etag-0',
          startsAt: '2026-09-12T03:00:00.000Z',
          endsAt: '2026-09-12T03:50:00.000Z',
        }),
      )

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValueOnce({ status: 'precondition_failed' })
      .mockResolvedValueOnce({ status: 'updated', etag: 'etag-2' })

    const deps = makeDeps({
      loadBooking,
      updateEvent,
      fetchEvent: vi.fn(async () => ({
        status: 'ok' as const,
        etag: 'etag-1',
        summary: null,
        eventStatus: 'confirmed',
        privateBookingId: null,
      })),
    })

    await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(updateEvent.mock.calls[1][0].startsAt).toBe('2026-09-12T03:00:00.000Z')
    expect(updateEvent.mock.calls[1][0].endsAt).toBe('2026-09-12T03:50:00.000Z')
  })

  it('fails after bounded 412 retries while still latest', async () => {
    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'precondition_failed' })

    const deps = makeDeps({
      updateEvent,
      fetchEvent: vi.fn(async () => ({
        status: 'ok' as const,
        etag: 'etag-moving',
        summary: null,
        eventStatus: 'confirmed',
        privateBookingId: null,
      })),
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )

    expect(result).toBe('failed')
    expect(updateEvent).toHaveBeenCalledTimes(CALENDAR_RESCHEDULE_MAX_PATCH_ATTEMPTS)
  })

  it('create path claims stable event id before Google create (lost-response safe)', async () => {
    const stableId = coachingBookingCalendarEventId(BOOKING_ID)
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(baseSnap({ googleCalendarEventId: null, googleCalendarEtag: null }))
      .mockResolvedValueOnce(baseSnap({ googleCalendarEventId: null, googleCalendarEtag: null }))
      .mockResolvedValue(
        baseSnap({ googleCalendarEventId: stableId, googleCalendarEtag: null }),
      )

    const persistMeta = vi
      .fn<CalendarRescheduleSyncDeps['persistMeta']>()
      .mockResolvedValueOnce('ok') // claim stable id
      .mockResolvedValueOnce('ok') // persist etag

    const createEvent = vi.fn(async () => ({ eventId: stableId, etag: 'etag-created' }))
    const deleteEvent = vi.fn(async () => undefined)

    const deps = makeDeps({
      loadBooking,
      persistMeta,
      createEvent,
      deleteEvent,
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: null },
      deps,
    )

    expect(result).toBe('created')
    expect(persistMeta.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        eventId: stableId,
        requireNullEventId: true,
        etag: null,
      }),
    )
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ bookingId: BOOKING_ID }))
    expect(deleteEvent).not.toHaveBeenCalled()
  })

  it('create path CAS-lose adopts peer stable id without deleting', async () => {
    const stableId = coachingBookingCalendarEventId(BOOKING_ID)
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(baseSnap({ googleCalendarEventId: null, googleCalendarEtag: null }))
      .mockResolvedValueOnce(baseSnap({ googleCalendarEventId: null, googleCalendarEtag: null }))
      .mockResolvedValueOnce(
        baseSnap({ googleCalendarEventId: stableId, googleCalendarEtag: 'etag-peer' }),
      )
      .mockResolvedValue(
        baseSnap({ googleCalendarEventId: stableId, googleCalendarEtag: 'etag-peer' }),
      )

    const persistMeta = vi
      .fn<CalendarRescheduleSyncDeps['persistMeta']>()
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('ok')

    const createEvent = vi.fn(async () => ({ eventId: stableId, etag: 'e' }))
    const deleteEvent = vi.fn(async () => undefined)
    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'updated', etag: 'etag-final' })

    const deps = makeDeps({
      loadBooking,
      persistMeta,
      createEvent,
      deleteEvent,
      updateEvent,
    })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: null },
      deps,
    )

    expect(result).toBe('updated')
    expect(createEvent).not.toHaveBeenCalled()
    expect(deleteEvent).not.toHaveBeenCalled()
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: stableId, ifMatchEtag: 'etag-peer' }),
    )
  })

  it('on ownership_mismatch clears DB event id and creates stable-id event', async () => {
    const stableId = coachingBookingCalendarEventId(BOOKING_ID)
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValueOnce(
        baseSnap({ googleCalendarEventId: 'legacy-evt', scheduleRevision: 'rev-2' }),
      )
      .mockResolvedValue(
        baseSnap({
          googleCalendarEventId: null,
          googleCalendarEtag: null,
          scheduleRevision: 'rev-2',
        }),
      )

    const updateEvent = vi
      .fn<CalendarRescheduleSyncDeps['updateEvent']>()
      .mockResolvedValue({ status: 'ownership_mismatch' })

    const persistMeta = vi.fn<CalendarRescheduleSyncDeps['persistMeta']>().mockResolvedValue('ok')
    const createEvent = vi.fn<CalendarRescheduleSyncDeps['createEvent']>().mockResolvedValue({
      eventId: stableId,
      etag: 'etag-new',
    })

    const deps = makeDeps({ loadBooking, updateEvent, persistMeta, createEvent })

    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'legacy-evt' },
      deps,
    )

    expect(result).toBe('created')
    expect(persistMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        matchEventId: 'legacy-evt',
        eventId: null,
      }),
    )
    expect(createEvent).toHaveBeenCalled()
  })

  it('skips calendar sync when booking is no longer scheduled', async () => {
    const loadBooking = vi
      .fn<CalendarRescheduleSyncDeps['loadBooking']>()
      .mockResolvedValue(baseSnap({ status: 'cancelled', scheduleRevision: 'rev-2' }))

    const deps = makeDeps({ loadBooking })
    const result = await runCalendarRescheduleSync(
      { bookingId: BOOKING_ID, changeRevision: 'rev-2', googleCalendarEventId: 'evt-1' },
      deps,
    )
    expect(result).toBe('skipped_stale')
    expect(deps.updateEvent).not.toHaveBeenCalled()
  })
})
