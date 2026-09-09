import { createClient } from '@/lib/supabase/server'
import {
  createCoachingBookingCalendarEvent,
  updateCoachingBookingCalendarEvent,
  type CoachingCalendarUpdateResult,
} from '@/lib/google-calendar/events'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'

/**
 * Sync GWS only while this reschedule revision is still the booking's latest.
 * Prevents a slower older patch from overwriting a newer continuous change.
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
  /** `booked_at` written by the successful DB reschedule. */
  changeRevision: string
}): Promise<'updated' | 'created' | 'skipped_stale' | 'skipped_unconfigured' | 'failed'> {
  const supabase = await createClient()

  const { data: current, error } = await supabase
    .from('coaching_bookings')
    .select('slot_id, booked_at, google_calendar_event_id, status')
    .eq('id', params.bookingId)
    .maybeSingle<{
      slot_id: string
      booked_at: string
      google_calendar_event_id: string | null
      status: string
    }>()

  if (error || !current) return 'failed'

  // Another reschedule already moved the booking — do not apply this op's times.
  if (
    current.status !== 'scheduled' ||
    current.slot_id !== params.newSlotId ||
    current.booked_at !== params.changeRevision
  ) {
    return 'skipped_stale'
  }

  const eventId = current.google_calendar_event_id ?? params.googleCalendarEventId

  if (eventId) {
    const result: CoachingCalendarUpdateResult = await updateCoachingBookingCalendarEvent({
      eventId,
      studentId: params.studentId,
      coachId: params.newCoachId,
      startsAt: params.newStartsAt,
      endsAt: params.newEndsAt,
      studentNote: params.studentNote,
    })
    if (result === 'failed') return 'failed'
    if (result === 'skipped') return 'skipped_unconfigured'
    return 'updated'
  }

  if (!getGoogleCalendarClient()) return 'skipped_unconfigured'

  const calendarEventId = await createCoachingBookingCalendarEvent({
    studentId: params.studentId,
    slotId: params.newSlotId,
    coachId: params.newCoachId,
    startsAt: params.newStartsAt,
    studentNote: params.studentNote,
  })

  if (!calendarEventId) return 'failed'

  // Re-check revision before writing the event id so we do not attach it to a newer change.
  const { data: stillCurrent, error: recheckError } = await supabase
    .from('coaching_bookings')
    .update({ google_calendar_event_id: calendarEventId })
    .eq('id', params.bookingId)
    .eq('booked_at', params.changeRevision)
    .eq('slot_id', params.newSlotId)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (recheckError) return 'failed'
  if (!stillCurrent) return 'skipped_stale'
  return 'created'
}
