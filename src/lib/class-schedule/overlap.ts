export type TimeRange = {
  start: string
  end: string
}

/** Normalize HH:MM or HH:MM:SS to minutes from midnight. Returns null if invalid. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] != null ? Number(match[3]) : 0
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null
  }
  return hours * 60 + minutes
}

/** Half-open overlap: [start, end). Touching endpoints do not overlap. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aStart = parseTimeToMinutes(a.start)
  const aEnd = parseTimeToMinutes(a.end)
  const bStart = parseTimeToMinutes(b.start)
  const bEnd = parseTimeToMinutes(b.end)
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false
  return aStart < bEnd && bStart < aEnd
}

export type SessionLikeForOverlap = {
  id?: string
  start_time: string
  end_time: string
  status?: string | null
}

/**
 * Returns true when `candidate` overlaps any other scheduled session.
 * Cancelled sessions are ignored. Pass excludeId when editing an existing row.
 */
export function hasOverlappingScheduledSession(
  candidate: SessionLikeForOverlap,
  existing: SessionLikeForOverlap[],
  excludeId?: string | null,
): boolean {
  if (candidate.status === 'cancelled') return false

  const candidateId = excludeId ?? candidate.id ?? null

  for (const session of existing) {
    if (session.status === 'cancelled') continue
    if (candidateId && session.id && session.id === candidateId) continue
    if (
      rangesOverlap(
        { start: candidate.start_time, end: candidate.end_time },
        { start: session.start_time, end: session.end_time },
      )
    ) {
      return true
    }
  }

  return false
}

/** Validate a list of new scheduled sessions among themselves (no self-pairs). */
export function findFirstInternalOverlap(
  sessions: SessionLikeForOverlap[],
): { indexA: number; indexB: number } | null {
  for (let i = 0; i < sessions.length; i += 1) {
    const a = sessions[i]
    if (a.status === 'cancelled') continue
    for (let j = i + 1; j < sessions.length; j += 1) {
      const b = sessions[j]
      if (b.status === 'cancelled') continue
      if (
        rangesOverlap(
          { start: a.start_time, end: a.end_time },
          { start: b.start_time, end: b.end_time },
        )
      ) {
        return { indexA: i, indexB: j }
      }
    }
  }
  return null
}
