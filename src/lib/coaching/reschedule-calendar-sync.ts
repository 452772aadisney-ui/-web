import { createClient } from '@/lib/supabase/server'
import {
  createCoachingBookingCalendarEvent,
  deleteCoachingBookingCalendarEvent,
  fetchCoachingBookingCalendarEvent,
  updateCoachingBookingCalendarEvent,
  type CoachingCalendarUpdateResult,
  type CreatedCalendarEvent,
  type FetchCalendarEventResult,
} from '@/lib/google-calendar/events'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'
import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'

export type CalendarRescheduleSyncResult =
  | 'updated'
  | 'created'
  | 'skipped_stale'
  | 'skipped_unconfigured'
  | 'failed'

/** Cap If-Match 412 / missing-etag refresh loops while still the latest revision. */
export const CALENDAR_RESCHEDULE_MAX_PATCH_ATTEMPTS = 4

export type CalendarBookingSnapshot = {
  status: string
  slotId: string
  scheduleRevision: string
  coachId: string
  studentId: string
  studentNote: string
  startsAt: string
  endsAt: string
  googleCalendarEventId: string | null
  googleCalendarEtag: string | null
}

export type CalendarRescheduleSyncDeps = {
  loadBooking: (bookingId: string) => Promise<CalendarBookingSnapshot | null>
  persistMeta: (params: {
    bookingId: string
    changeRevision: string
    slotId: string
    eventId?: string | null
    etag: string | null
    /** When clearing `google_calendar_event_id`, require current id match CAS. */
    matchEventId?: string | null
    /** When true, only write event id if still null (create race). */
    requireNullEventId?: boolean
  }) => Promise<'ok' | 'stale' | 'failed'>
  updateEvent: (input: {
    eventId: string
    bookingId: string
    studentId: string
    coachId: string
    startsAt: string
    endsAt: string
    studentNote: string
    ifMatchEtag: string
    dbEventId?: string | null
  }) => Promise<CoachingCalendarUpdateResult>
  fetchEvent: (eventId: string) => Promise<FetchCalendarEventResult>
  createEvent: (input: {
    bookingId: string
    studentId: string
    slotId: string
    coachId: string
    startsAt: string
    studentNote: string
    dbEventId?: string | null
  }) => Promise<CreatedCalendarEvent | null>
  deleteEvent: (eventId: string) => Promise<void>
  isConfigured: () => boolean
}

function isLatestRevision(
  snap: CalendarBookingSnapshot,
  changeRevision: string,
): boolean {
  return (
    snap.status === 'scheduled' && snap.scheduleRevision === changeRevision
  )
}

/**
 * Sync GWS for a successful reschedule revision.
 *
 * - Always patches with If-Match (never unconditional update of an existing event).
 * - On 412: if this changeRevision is no longer latest → skip; if still latest →
 *   refetch etag + DB booking fields and retry (bounded).
 * - Missing DB etag: GET event for etag, re-check revision, then If-Match patch.
 * - Create: CAS event_id only while null; orphan creates are deleted on lost race.
 *
 * Residual: Google may briefly show an older revision's times until the latest
 * writer finishes its 412-retry; Discord is unrelated to this module.
 */
export async function runCalendarRescheduleSync(
  params: {
    bookingId: string
    changeRevision: string
    /** Hint only; live slot/times always come from DB when revision matches. */
    googleCalendarEventId: string | null
  },
  deps: CalendarRescheduleSyncDeps,
): Promise<CalendarRescheduleSyncResult> {
  const initial = await deps.loadBooking(params.bookingId)
  if (!initial) return 'failed'
  if (!isLatestRevision(initial, params.changeRevision)) return 'skipped_stale'

  let eventId =
    initial.googleCalendarEventId?.trim() ||
    params.googleCalendarEventId?.trim() ||
    null

  if (eventId) {
    return patchExistingEvent({
      bookingId: params.bookingId,
      changeRevision: params.changeRevision,
      eventId,
      deps,
    })
  }

  return createNewEvent({
    bookingId: params.bookingId,
    changeRevision: params.changeRevision,
    deps,
  })
}

async function patchExistingEvent(args: {
  bookingId: string
  changeRevision: string
  eventId: string
  deps: CalendarRescheduleSyncDeps
}): Promise<CalendarRescheduleSyncResult> {
  const { bookingId, changeRevision, deps } = args
  let eventId = args.eventId

  for (let attempt = 0; attempt < CALENDAR_RESCHEDULE_MAX_PATCH_ATTEMPTS; attempt += 1) {
    const snap = await deps.loadBooking(bookingId)
    if (!snap) return 'failed'
    if (!isLatestRevision(snap, changeRevision)) return 'skipped_stale'

    const liveEventId =
      snap.googleCalendarEventId?.trim() || eventId
    if (!liveEventId) {
      return createNewEvent({ bookingId, changeRevision, deps })
    }
    eventId = liveEventId

    let live = snap
    let ifMatch = live.googleCalendarEtag?.trim() || null
    if (!ifMatch) {
      const fetched = await deps.fetchEvent(eventId)
      if (fetched.status === 'unconfigured') return 'skipped_unconfigured'
      if (fetched.status === 'not_found') {
        // Event missing at Google: restore via stable booking id (do not clear a
        // newer peer's event_id). Only CAS-clear when DB still points at this id.
        const cleared = await deps.persistMeta({
          bookingId,
          changeRevision,
          slotId: live.slotId,
          matchEventId: eventId,
          eventId: null,
          etag: null,
        })
        if (cleared === 'stale') return 'skipped_stale'
        if (cleared === 'failed') return 'failed'
        return createNewEvent({ bookingId, changeRevision, deps })
      }
      if (fetched.status !== 'ok' || !fetched.etag?.trim()) return 'failed'

      // Gap after GET: another reschedule may have won.
      const afterGet = await deps.loadBooking(bookingId)
      if (!afterGet) return 'failed'
      if (!isLatestRevision(afterGet, changeRevision)) return 'skipped_stale'

      live = afterGet
      ifMatch = fetched.etag.trim()
    }

    const result = await deps.updateEvent({
      eventId,
      bookingId,
      studentId: live.studentId,
      coachId: live.coachId,
      startsAt: live.startsAt,
      endsAt: live.endsAt,
      studentNote: live.studentNote,
      ifMatchEtag: ifMatch,
      // Legacy ownership: only the event_id stored on this booking row.
      dbEventId: live.googleCalendarEventId,
    })

    if (result.status === 'skipped') return 'skipped_unconfigured'
    if (result.status === 'failed') return 'failed'
    if (result.status === 'missing_etag') return 'failed'
    if (result.status === 'ownership_mismatch') {
      // Do not patch/restore an unproven event (e.g. cancelled without private props).
      // Clear our DB link (CAS) and create a booking-owned stable-id event instead.
      const cleared = await deps.persistMeta({
        bookingId,
        changeRevision,
        slotId: live.slotId,
        matchEventId: eventId,
        eventId: null,
        etag: null,
      })
      if (cleared === 'stale') return 'skipped_stale'
      if (cleared === 'failed') return 'failed'
      return createNewEvent({ bookingId, changeRevision, deps })
    }

    if (result.status === 'precondition_failed') {
      // Another writer beat us. Only retry if we are still the latest revision.
      const after412 = await deps.loadBooking(bookingId)
      if (!after412) return 'failed'
      if (!isLatestRevision(after412, changeRevision)) return 'skipped_stale'

      const refreshed = await deps.fetchEvent(eventId)
      if (refreshed.status === 'unconfigured') return 'skipped_unconfigured'
      if (refreshed.status === 'not_found') {
        const cleared = await deps.persistMeta({
          bookingId,
          changeRevision,
          slotId: after412.slotId,
          matchEventId: eventId,
          eventId: null,
          etag: null,
        })
        if (cleared === 'stale') return 'skipped_stale'
        if (cleared === 'failed') return 'failed'
        return createNewEvent({ bookingId, changeRevision, deps })
      }
      if (refreshed.status !== 'ok' || !refreshed.etag?.trim()) return 'failed'

      // Store freshest etag for this revision so the next attempt uses If-Match.
      await deps.persistMeta({
        bookingId,
        changeRevision,
        slotId: after412.slotId,
        etag: refreshed.etag,
      })
      continue
    }

    // updated — body came from DB snapshot for this revision (not a stale in-memory schedule).
    const persisted = await deps.persistMeta({
      bookingId,
      changeRevision,
      slotId: live.slotId,
      etag: result.etag,
    })
    if (persisted === 'stale') return 'skipped_stale'
    if (persisted === 'failed') return 'failed'
    return 'updated'
  }

  // Exhausted retries while still claiming to be latest → hard failure (do not skip).
  return 'failed'
}

async function createNewEvent(args: {
  bookingId: string
  changeRevision: string
  deps: CalendarRescheduleSyncDeps
}): Promise<CalendarRescheduleSyncResult> {
  const { bookingId, changeRevision, deps } = args

  if (!deps.isConfigured()) return 'skipped_unconfigured'

  const before = await deps.loadBooking(bookingId)
  if (!before) return 'failed'
  if (!isLatestRevision(before, changeRevision)) return 'skipped_stale'

  // Peer may have created while we decided to create.
  const existingId = before.googleCalendarEventId?.trim()
  if (existingId) {
    return patchExistingEvent({
      bookingId,
      changeRevision,
      eventId: existingId,
      deps,
    })
  }

  let stableId: string
  try {
    stableId = coachingBookingCalendarEventId(bookingId)
  } catch {
    return 'failed'
  }

  // Persist stable id before external create so a lost response still points at
  // the same Google event on retry (requireNullEventId CAS).
  const claimed = await deps.persistMeta({
    bookingId,
    changeRevision,
    slotId: before.slotId,
    eventId: stableId,
    etag: null,
    requireNullEventId: true,
  })

  if (claimed === 'stale') {
    const again = await deps.loadBooking(bookingId)
    if (!again) return 'failed'
    if (!isLatestRevision(again, changeRevision)) return 'skipped_stale'
    const peerId = again.googleCalendarEventId?.trim()
    if (peerId) {
      return patchExistingEvent({
        bookingId,
        changeRevision,
        eventId: peerId,
        deps,
      })
    }
    return 'failed'
  }
  if (claimed === 'failed') return 'failed'

  const created = await deps.createEvent({
    bookingId,
    studentId: before.studentId,
    slotId: before.slotId,
    coachId: before.coachId,
    startsAt: before.startsAt,
    studentNote: before.studentNote,
    dbEventId: before.googleCalendarEventId,
  })
  if (!created) return 'failed'

  // Stable-id create must return the same id; never delete a peer's event.
  if (created.eventId !== stableId) {
    console.error('[coaching] calendar create returned unexpected event id')
    return 'failed'
  }

  const persisted = await deps.persistMeta({
    bookingId,
    changeRevision,
    slotId: before.slotId,
    eventId: created.eventId,
    etag: created.etag,
  })
  if (persisted === 'stale') return 'skipped_stale'
  if (persisted === 'failed') return 'failed'
  return 'created'
}

async function loadBookingSnapshot(
  bookingId: string,
): Promise<CalendarBookingSnapshot | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_bookings')
    .select(
      'slot_id, schedule_revision, google_calendar_event_id, google_calendar_etag, status, coach_id, student_id, student_note, coaching_slots(starts_at, ends_at)',
    )
    .eq('id', bookingId)
    .maybeSingle<{
      slot_id: string
      schedule_revision: string
      google_calendar_event_id: string | null
      google_calendar_etag: string | null
      status: string
      coach_id: string
      student_id: string
      student_note: string
      coaching_slots: { starts_at: string; ends_at: string } | { starts_at: string; ends_at: string }[]
    }>()

  if (error || !data) return null

  const slotRel = Array.isArray(data.coaching_slots)
    ? data.coaching_slots[0]
    : data.coaching_slots
  if (!slotRel?.starts_at || !slotRel?.ends_at) return null

  return {
    status: data.status,
    slotId: data.slot_id,
    scheduleRevision: data.schedule_revision,
    coachId: data.coach_id,
    studentId: data.student_id,
    studentNote: data.student_note,
    startsAt: slotRel.starts_at,
    endsAt: slotRel.ends_at,
    googleCalendarEventId: data.google_calendar_event_id,
    googleCalendarEtag: data.google_calendar_etag,
  }
}

async function persistCalendarMeta(params: {
  bookingId: string
  changeRevision: string
  slotId: string
  eventId?: string | null
  etag: string | null
  matchEventId?: string | null
  requireNullEventId?: boolean
}): Promise<'ok' | 'stale' | 'failed'> {
  const supabase = await createClient()
  const patch: {
    google_calendar_etag: string | null
    google_calendar_event_id?: string | null
  } = {
    google_calendar_etag: params.etag,
  }
  if (params.eventId !== undefined) {
    patch.google_calendar_event_id = params.eventId
  }

  let query = supabase
    .from('coaching_bookings')
    .update(patch)
    .eq('id', params.bookingId)
    .eq('schedule_revision', params.changeRevision)
    .eq('slot_id', params.slotId)
    .eq('status', 'scheduled')

  // CAS for clearing: only clear if the current google_calendar_event_id matches.
  if (params.matchEventId !== undefined) {
    query = query.eq('google_calendar_event_id', params.matchEventId)
  }

  if (params.requireNullEventId) {
    query = query.is('google_calendar_event_id', null)
  }

  const { data, error } = await query.select('id').maybeSingle<{ id: string }>()

  if (error) return 'failed'
  if (!data) return 'stale'
  return 'ok'
}

const liveDeps: CalendarRescheduleSyncDeps = {
  loadBooking: loadBookingSnapshot,
  persistMeta: persistCalendarMeta,
  updateEvent: (input) => updateCoachingBookingCalendarEvent(input),
  fetchEvent: fetchCoachingBookingCalendarEvent,
  createEvent: createCoachingBookingCalendarEvent,
  deleteEvent: async (eventId) => {
    await deleteCoachingBookingCalendarEvent(eventId)
  },
  isConfigured: () => Boolean(getGoogleCalendarClient()),
}

export async function syncCalendarAfterCoachingReschedule(params: {
  bookingId: string
  studentId: string
  newSlotId: string
  newCoachId: string
  newStartsAt: string
  newEndsAt: string
  studentNote: string
  googleCalendarEventId: string | null
  /** Persisted schedule_revision from the successful DB reschedule. */
  changeRevision: string
}): Promise<CalendarRescheduleSyncResult> {
  // studentId / slot / times are intentionally ignored here — live DB snapshot
  // is the source of truth so a 412 retry never writes an older in-memory schedule.
  void params.studentId
  void params.newSlotId
  void params.newCoachId
  void params.newStartsAt
  void params.newEndsAt
  void params.studentNote

  return runCalendarRescheduleSync(
    {
      bookingId: params.bookingId,
      changeRevision: params.changeRevision,
      googleCalendarEventId: params.googleCalendarEventId,
    },
    liveDeps,
  )
}
