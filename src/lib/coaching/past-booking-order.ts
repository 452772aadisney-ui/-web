/**
 * Pure past-booking sort used after light key fetch (booking unit).
 * Formal order: slot_date DESC → start_time ASC → id ASC.
 */
export function comparePastCoachingBookingSortKeys(
  a: { id: string; slot_date: string; start_time: string },
  b: { id: string; slot_date: string; start_time: string },
): number {
  const byDate = b.slot_date.localeCompare(a.slot_date)
  if (byDate !== 0) return byDate
  const byTime = a.start_time.localeCompare(b.start_time)
  if (byTime !== 0) return byTime
  return a.id.localeCompare(b.id)
}

export function sortPastCoachingBookingSortKeys<
  T extends { id: string; slot_date: string; start_time: string },
>(rows: T[]): T[] {
  return [...rows].sort(comparePastCoachingBookingSortKeys)
}
