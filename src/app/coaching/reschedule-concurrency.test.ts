import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('performCoachingReschedule concurrency guards', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/coaching/actions.ts'), 'utf8')

  it('updates only from the observed slot and requires a returned row', () => {
    expect(source).toContain(".eq('slot_id', booking.slot_id)")
    expect(source).toContain('.maybeSingle<{ id: string; booked_at: string }>()')
    expect(source).toContain('予約は他の操作により変更済みです')
    expect(source).toContain('isUniqueViolation')
    expect(source).toContain('changeRevision')
  })

  it('keeps student auth gate separate from admin', () => {
    expect(source).toContain("params.actor === 'student' && booking.student_id !== params.actorUserId")
    expect(source).toContain('export async function adminRescheduleCoachingBooking')
    expect(source).toContain('export async function rescheduleCoachingBooking')
  })
})
