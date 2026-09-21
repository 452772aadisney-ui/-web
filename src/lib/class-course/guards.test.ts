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

  it('skips when another lineage already has effective attend', () => {
    const plan = planBulkMarkAttended([
      {
        studentId: 'a',
        label: 'A',
        currentStatus: 'absent',
        blockedByOtherEffectiveAttend: true,
      },
    ])
    expect(plan.toSave).toHaveLength(0)
    expect(plan.alreadyAttended).toHaveLength(1)
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
  it('blocks remove when THIS lineage latest is attended or absent', () => {
    expect(
      canRemoveSessionAttendee({
        lineageEventsNewestFirst: [{ status: 'attended' }],
      }).ok,
    ).toBe(false)
    expect(
      canRemoveSessionAttendee({
        lineageEventsNewestFirst: [{ status: 'absent' }],
      }).ok,
    ).toBe(false)
    expect(
      canRemoveSessionAttendee({
        lineageEventsNewestFirst: [{ status: 'not_done' }, { status: 'attended' }],
      }).ok,
    ).toBe(true)
  })

  it('blocks assignment cancel while any lineage effectively attended', () => {
    expect(
      canCancelClassCourseAssignment({
        events: [
          {
            course_unit_id: 'u1',
            attendance_lineage_id: 's2',
            status: 'attended',
          },
          {
            course_unit_id: 'u1',
            attendance_lineage_id: 's1',
            status: 'not_done',
          },
        ],
        sessionAttendeeCount: 0,
      }),
    ).toEqual({ ok: false, reason: 'has_attended' })
    expect(
      canCancelClassCourseAssignment({
        events: [
          {
            course_unit_id: 'u1',
            attendance_lineage_id: 's1',
            status: 'absent',
          },
        ],
        sessionAttendeeCount: 0,
      }).ok,
    ).toBe(true)
    expect(
      canCancelClassCourseAssignment({
        events: [],
        sessionAttendeeCount: 2,
      }),
    ).toEqual({ ok: false, reason: 'still_on_sessions' })
    expect(assignmentCancelErrorMessage('has_attended')).toMatch(/訂正/)
  })
})
