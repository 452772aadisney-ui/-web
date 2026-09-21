/**
 * Pure helpers for class-schedule notification audience scoping.
 */

export type SessionAudienceSnapshot = {
  sessionId: string
  audienceType: 'all_kisotsu' | 'targeted'
  attendeeIds: string[]
}

/** Day-level: union attendees; if any all_kisotsu → all_kisotsu. */
export function resolveDayNotifyAudience(
  sessions: readonly SessionAudienceSnapshot[],
): 'all_kisotsu' | string[] {
  if (sessions.length === 0) return 'all_kisotsu'
  if (sessions.some((s) => s.audienceType === 'all_kisotsu')) {
    return 'all_kisotsu'
  }
  return [...new Set(sessions.flatMap((s) => s.attendeeIds))]
}

/** Single session: all_kisotsu or its attendees only (ignore other sessions). */
export function resolveSessionNotifyAudience(
  session: SessionAudienceSnapshot,
): 'all_kisotsu' | string[] {
  if (session.audienceType === 'all_kisotsu') return 'all_kisotsu'
  return [...new Set(session.attendeeIds)]
}

/**
 * Attendee set change: notify union of before and after (includes removed + added).
 * Does not expand to day-wide all_kisotsu merely because another session is all_kisotsu.
 */
export function resolveAttendeeChangeNotifyAudience(params: {
  beforeIds: readonly string[]
  afterIds: readonly string[]
}): string[] {
  return [...new Set([...params.beforeIds, ...params.afterIds])]
}
