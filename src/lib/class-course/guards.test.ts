import { describe, expect, it } from 'vitest'
import {
  assignmentCancelErrorMessage,
  canCancelClassCourseAssignment,
  canRemoveSessionAttendee,
  planBulkMarkAttended,
  summarizeBulkAttendResult,
} from '@/lib/class-course/guards'

describe('planBulkMarkAttended', () => {
  it('classifies absent corrections and skips already attended', () => {
    const plan = planBulkMarkAttended([
      { studentId: 'a', label: 'A', currentStatus: 'not_done' },
      { studentId: 'b', label: 'B', currentStatus: 'absent' },
      { studentId: 'c', label: 'C', currentStatus: 'attended' },
    ])
    expect(plan.toSave.map((p) => p.studentId)).toEqual(['a', 'b'])
    expect(plan.absentToCorrect.map((p) => p.studentId)).toEqual(['b'])
    expect(plan.alreadyAttended.map((p) => p.studentId)).toEqual(['c'])
  })
})

describe('summarizeBulkAttendResult', () => {
  it('does not report full success when any failed', () => {
    expect(
      summarizeBulkAttendResult({
        attempted: 3,
        saved: 2,
        skippedAlreadyAttended: 0,
        failed: 1,
      }).ok,
    ).toBe(false)
  })
})

describe('attendee / assignment guards', () => {
  it('blocks remove when latest is attended or absent', () => {
    expect(
      canRemoveSessionAttendee({
        eventsNewestFirst: [{ status: 'attended' }],
      }).ok,
    ).toBe(false)
    expect(
      canRemoveSessionAttendee({
        eventsNewestFirst: [{ status: 'absent' }],
      }).ok,
    ).toBe(false)
    expect(
      canRemoveSessionAttendee({
        eventsNewestFirst: [{ status: 'not_done' }, { status: 'attended' }],
      }).ok,
    ).toBe(true)
  })

  it('blocks assignment cancel while attended or still on sessions', () => {
    expect(
      canCancelClassCourseAssignment({
        eventsNewestFirst: [{ status: 'attended' }],
        sessionAttendeeCount: 0,
      }),
    ).toEqual({ ok: false, reason: 'has_attended' })
    expect(
      canCancelClassCourseAssignment({
        eventsNewestFirst: [{ status: 'not_done' }],
        sessionAttendeeCount: 2,
      }),
    ).toEqual({ ok: false, reason: 'still_on_sessions' })
    expect(
      canCancelClassCourseAssignment({
        eventsNewestFirst: [{ status: 'absent' }],
        sessionAttendeeCount: 0,
      }).ok,
    ).toBe(true)
    expect(assignmentCancelErrorMessage('has_attended')).toMatch(/訂正/)
  })
})
