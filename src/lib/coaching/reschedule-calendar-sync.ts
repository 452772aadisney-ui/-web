import { createClient } from '@/lib/supabase/server'
import {
  createCoachingBookingCalendarEvent,
  fetchCoachingBookingCalendarEventEtag,
  updateCoachingBookingCalendarEvent,
} from '@/lib/google-calendar/events'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'

export type CalendarRescheduleSyncResult =
  | 'updated'
  | 'created'
  | 'skipped_stale'
  | 'skipped_unconfigured'
  | 'failed'

async function bookingStillAtRevision(
  bookingId: string,
  changeRevision: string,
  newSlotId: string,
): Promise<
  | {
      ok: true
      googleCalendarEventId: string | null
      googleCalendarEtag: string | null
    }
  | { ok: false; reason: 'failed' | 'stale' }
> {
  const supabase = await createClient()
  const { data: current, error } = await supabase
    .from('coaching_bookings')
    .select('slot_id, schedule_revision, google_calendar_event_id, google_calendar_etag, status')
    .eq('id', bookingId)
    .maybeSingle<{
      slot_id: string
      schedule_revision: string
      google_calendar_event_id: string | null
      google_calendar_etag: string | null
      status: string
    }>()

  if (error || !current) return { ok: false, reason: 'failed' }

  if (
    current.status !== 'scheduled' ||
    current.slot_id !== newSlotId ||
    current.schedule_revision !== changeRevision
  ) {
    return { ok: false, reason: 'stale' }
  }

  return {
    ok: true,
    googleCalendarEventId: current.google_calendar_event_id,
    googleCalendarEtag: current.google_calendar_etag,
  }
}

async function persistCalendarMeta(params: {
  bookingId: string
  changeRevision: string
  newSlotId: string
  eventId?: string | null
  etag: string | null
}): Promise<'ok' | 'stale' | 'failed'> {
  const supabase = await createClient()
  const patch: { google_calendar_etag: string | null; google_calendar_event_id?: string } = {
    google_calendar_etag: params.etag,
  }
  if (params.eventId) {
    patch.google_calendar_event_id = params.eventId
  }

  const { data, error } = await supabase
    .from('coaching_bookings')
    .update(patch)
    .eq('id', params.bookingId)
    .eq('schedule_revision', params.changeRevision)
    .eq('slot_id', params.newSlotId)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) return 'failed'
  if (!data) return 'stale'
  return 'ok'
}

/**
 * Sync GWS for a successful reschedule revision.
 *
 * Ordering across instances:
 * - DB CAS on schedule_revision before/after external calls
 * - Google Calendar If-Match (etag) so an older patch after a newer one gets 412
 *
 * Residual: if etag is missing (legacy rows / first sync), first writer has no If-Match;
 * a concurrent first writer can still race until an etag is stored. After etags exist,
 * 412 + revision CAS rejects stale writers.
 */
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
  const still = await bookingStillAtRevision(
    params.bookingId,
    params.changeRevision,
    params.newSlotId,
  )
  if (!still.ok) return still.reason === 'stale' ? 'skipped_stale' : 'failed'

  const eventId = still.googleCalendarEventId ?? params.googleCalendarEventId

  if (eventId) {
    let ifMatch = still.googleCalendarEtag
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await updateCoachingBookingCalendarEvent({
        eventId,
        studentId: params.studentId,
        coachId: params.newCoachId,
        startsAt: params.newStartsAt,
        endsAt: params.newEndsAt,
        studentNote: params.studentNote,
        ifMatchEtag: ifMatch,
      })

      if (result.status === 'skipped') return 'skipped_unconfigured'
      if (result.status === 'failed') return 'failed'

      if (result.status === 'precondition_failed') {
        const after412 = await bookingStillAtRevision(
          params.bookingId,
          params.changeRevision,
          params.newSlotId,
        )
        if (!after412.ok) {
          return after412.reason === 'stale' ? 'skipped_stale' : 'failed'
        }
        const fresh = await fetchCoachingBookingCalendarEventEtag(eventId)
        if (!fresh.ok) return 'failed'
        ifMatch = fresh.etag
        continue
      }

      const persisted = await persistCalendarMeta({
        bookingId: params.bookingId,
        changeRevision: params.changeRevision,
        newSlotId: params.newSlotId,
        etag: result.etag,
      })
      if (persisted === 'stale') return 'skipped_stale'
      if (persisted === 'failed') return 'failed'
      return 'updated'
    }
    return 'skipped_stale'
  }

  if (!getGoogleCalendarClient()) return 'skipped_unconfigured'

  const created = await createCoachingBookingCalendarEvent({
    studentId: params.studentId,
    slotId: params.newSlotId,
    coachId: params.newCoachId,
    startsAt: params.newStartsAt,
    studentNote: params.studentNote,
  })

  if (!created) return 'failed'

  const persisted = await persistCalendarMeta({
    bookingId: params.bookingId,
    changeRevision: params.changeRevision,
    newSlotId: params.newSlotId,
    eventId: created.eventId,
    etag: created.etag,
  })
  if (persisted === 'stale') return 'skipped_stale'
  if (persisted === 'failed') return 'failed'
  return 'created'
}
