/**
 * Google Calendar event `id` rules (Events resource):
 * - base32hex charset: lowercase a-v and digits 0-9
 * - length 5–1024
 *
 * Booking UUIDs (hex 0-9a-f) are a subset of that charset once dashes are removed.
 * Deleted events keep their id (status=cancelled); do not assume the id can be
 * re-inserted after delete — restore via update/patch instead.
 */
export function coachingBookingCalendarEventId(bookingId: string): string {
  const hex = bookingId.trim().toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('bookingId must be a UUID for stable calendar event id')
  }
  return `cbk${hex}`
}
