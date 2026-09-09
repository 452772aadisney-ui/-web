/**
 * Pure optimistic-lock predicates for coaching reschedule.
 * Used by DB updates and unit tests (incl. A→B→A stale request).
 */

export type BookingLockSnapshot = {
  status: string
  slotId: string
  scheduleRevision: string
}

/** True when an update observed against `observed` still matches `current`. */
export function matchesRescheduleOptimisticLock(
  observed: BookingLockSnapshot,
  current: BookingLockSnapshot,
): boolean {
  return (
    current.status === 'scheduled' &&
    observed.status === 'scheduled' &&
    current.slotId === observed.slotId &&
    current.scheduleRevision === observed.scheduleRevision
  )
}

/**
 * A→B→A then a stale A→B request: slot is again A, but revision advanced.
 * Lock must reject the stale request even though slot_id matches.
 */
export function isStaleAfterRoundTripToOriginalSlot(params: {
  observedRevision: string
  currentSlotId: string
  originalSlotId: string
  currentRevision: string
  currentStatus: string
}): boolean {
  return (
    params.currentStatus === 'scheduled' &&
    params.currentSlotId === params.originalSlotId &&
    params.currentRevision !== params.observedRevision
  )
}
