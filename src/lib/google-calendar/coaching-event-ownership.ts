import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'

/** private extendedProperties keys written on new coaching calendar events. */
export const COACHING_CALENDAR_PRIVATE_BOOKING_ID = 'coachingBookingId'
export const COACHING_CALENDAR_PRIVATE_APP = 'jukuApp'
export const COACHING_CALENDAR_APP_VALUE = 'juku-student-app'

export function buildCoachingCalendarExtendedProperties(bookingId: string): {
  private: Record<string, string>
} {
  return {
    private: {
      [COACHING_CALENDAR_PRIVATE_BOOKING_ID]: bookingId,
      [COACHING_CALENDAR_PRIVATE_APP]: COACHING_CALENDAR_APP_VALUE,
    },
  }
}

export type CalendarEventOwnershipInput = {
  bookingId: string
  eventId: string
  /** From Google private extendedProperties.coachingBookingId when present. */
  privateBookingId: string | null | undefined
  /**
   * google_calendar_event_id currently stored on this booking row (legacy link).
   * Used only when private props are absent (pre-migration events).
   */
  dbEventId: string | null | undefined
  eventStatus: string | null | undefined
  /**
   * When true, refuse restore/update unless ownership is proven by private prop
   * or stable event id. Legacy dbEventId alone is not enough to *restore*
   * cancelled events whose confirmation fields may be stripped.
   */
  requireStrongOwnership?: boolean
}

/**
 * Prove the Google event belongs to this coaching booking.
 *
 * Google cancelled/deleted events: only `id` is guaranteed; organizer calendars
 * may still expose details, but private extendedProperties are not guaranteed
 * after cancel (especially via sync). See Events.status=cancelled docs.
 */
export function resolveCoachingCalendarEventOwnership(
  input: CalendarEventOwnershipInput,
): { ok: true; via: 'private_prop' | 'stable_id' | 'db_event_id' } | { ok: false; reason: string } {
  if (input.privateBookingId && input.privateBookingId === input.bookingId) {
    return { ok: true, via: 'private_prop' }
  }

  try {
    if (coachingBookingCalendarEventId(input.bookingId) === input.eventId.trim()) {
      return { ok: true, via: 'stable_id' }
    }
  } catch {
    // invalid booking id — fall through
  }

  if (
    !input.requireStrongOwnership &&
    input.dbEventId?.trim() &&
    input.dbEventId.trim() === input.eventId.trim()
  ) {
    // Legacy migration: DB already links this booking to this event id.
    // Same title as another booking is not enough; db correspondence is required.
    return { ok: true, via: 'db_event_id' }
  }

  if (input.eventStatus === 'cancelled' && !input.privateBookingId) {
    return {
      ok: false,
      reason:
        'cancelled_without_ownership_proof: Google may omit extendedProperties on cancelled events; refuse restore',
    }
  }

  return { ok: false, reason: 'ownership_unproven' }
}
