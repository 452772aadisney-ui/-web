import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('performCoachingReschedule concurrency guards', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/coaching/actions.ts'), 'utf8')

  it('locks on observed slot + schedule_revision + scheduled status', () => {
    expect(source).toContain(".eq('slot_id', booking.slot_id)")
    expect(source).toContain(".eq('schedule_revision', observedRevision)")
    expect(source).toContain(".eq('status', 'scheduled')")
    expect(source).toContain('schedule_revision: changeRevision')
    expect(source).toContain('予約は他の操作により変更済みです')
    expect(source).toContain('isUniqueViolation')
  })

  it('exposes notify retry without changing the booking slot', () => {
    expect(source).toContain('export async function adminRetryCoachingRescheduleSideEffects')
    const start = source.indexOf('export async function adminRetryCoachingRescheduleSideEffects')
    const end = source.indexOf('type RescheduleCoreSuccess', start)
    const retryFn = source.slice(start, end === -1 ? undefined : end)
    expect(retryFn).toContain('changeRevision: booking.schedule_revision')
    expect(retryFn).not.toContain('performCoachingReschedule')
  })

  it('keeps student auth gate separate from admin', () => {
    expect(source).toContain("params.actor === 'student' && booking.student_id !== params.actorUserId")
    expect(source).toContain('export async function adminRescheduleCoachingBooking')
    expect(source).toContain('export async function rescheduleCoachingBooking')
  })
})
