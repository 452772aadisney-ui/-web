import { describe, expect, it } from 'vitest'
import {
  isStaleAfterRoundTripToOriginalSlot,
  matchesRescheduleOptimisticLock,
} from '@/lib/coaching/reschedule-optimistic-lock'

describe('reschedule optimistic lock', () => {
  it('accepts update only when slot, revision, and scheduled status match', () => {
    const observed = {
      status: 'scheduled',
      slotId: 'slot-A',
      scheduleRevision: 'rev-0',
    }
    expect(
      matchesRescheduleOptimisticLock(observed, {
        status: 'scheduled',
        slotId: 'slot-A',
        scheduleRevision: 'rev-0',
      }),
    ).toBe(true)
  })

  it('rejects when status left scheduled (cancelled / completed / no_show)', () => {
    const observed = {
      status: 'scheduled',
      slotId: 'slot-A',
      scheduleRevision: 'rev-0',
    }
    for (const status of ['cancelled', 'completed', 'no_show']) {
      expect(
        matchesRescheduleOptimisticLock(observed, {
          status,
          slotId: 'slot-A',
          scheduleRevision: 'rev-0',
        }),
      ).toBe(false)
    }
  })

  it('rejects stale A→B after A→B→A even when slot is again A', () => {
    // Observed at A/rev0, intending A→B. Meanwhile A→B→A finished at A/rev2.
    expect(
      isStaleAfterRoundTripToOriginalSlot({
        observedRevision: 'rev-0',
        originalSlotId: 'slot-A',
        currentSlotId: 'slot-A',
        currentRevision: 'rev-2',
        currentStatus: 'scheduled',
      }),
    ).toBe(true)

    expect(
      matchesRescheduleOptimisticLock(
        { status: 'scheduled', slotId: 'slot-A', scheduleRevision: 'rev-0' },
        { status: 'scheduled', slotId: 'slot-A', scheduleRevision: 'rev-2' },
      ),
    ).toBe(false)
  })

  it('rejects concurrent change that already moved off the observed slot', () => {
    expect(
      matchesRescheduleOptimisticLock(
        { status: 'scheduled', slotId: 'slot-A', scheduleRevision: 'rev-0' },
        { status: 'scheduled', slotId: 'slot-B', scheduleRevision: 'rev-1' },
      ),
    ).toBe(false)
  })
})
