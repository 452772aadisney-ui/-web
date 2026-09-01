export type CoachingKarteDraft = {
  sessionDate: string
  coachId: string
  discussionContent: string
  nextCommitments: string
  bookingId: string
}

export function getKarteDraftKey(studentId: string): string {
  return `coaching-karte-draft:${studentId}`
}

export function loadKarteDraft(studentId: string): CoachingKarteDraft | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(getKarteDraftKey(studentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CoachingKarteDraft>
    if (typeof parsed.sessionDate !== 'string') return null
    return {
      sessionDate: parsed.sessionDate,
      coachId: parsed.coachId ?? '',
      discussionContent: parsed.discussionContent ?? '',
      nextCommitments: parsed.nextCommitments ?? '',
      bookingId: parsed.bookingId ?? '',
    }
  } catch {
    return null
  }
}

export function saveKarteDraft(studentId: string, draft: CoachingKarteDraft): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getKarteDraftKey(studentId), JSON.stringify(draft))
}

export function clearKarteDraft(studentId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getKarteDraftKey(studentId))
}
