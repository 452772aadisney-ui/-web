import { describe, expect, it } from 'vitest'
import {
  canRecordAttendanceOnScheduleDate,
  computeRemainingCounts,
  resolveCurrentAttendanceStatus,
} from '@/lib/class-course/remaining'

describe('computeRemainingCounts', () => {
  it('digests each unit at most once even with multiple attended events', () => {
    const result = computeRemainingCounts({
      activeAssignmentUnitIds: ['u1', 'u2', 'u3'],
      attendanceEvents: [
        { course_unit_id: 'u1', status: 'absent' },
        { course_unit_id: 'u1', status: 'attended' },
        { course_unit_id: 'u1', status: 'attended' },
        { course_unit_id: 'u2', status: 'absent' },
      ],
    })
    expect(result).toEqual({
      assignedCount: 3,
      attendedCount: 1,
      remainingCount: 2,
    })
  })
})

describe('resolveCurrentAttendanceStatus', () => {
  it('defaults to not_done', () => {
    expect(resolveCurrentAttendanceStatus([])).toBe('not_done')
  })
})

describe('canRecordAttendanceOnScheduleDate', () => {
  it('allows today and past only', () => {
    expect(
      canRecordAttendanceOnScheduleDate({
        scheduleDateKey: '2026-09-20',
        todayKeyJst: '2026-09-20',
      }),
    ).toBe(true)
    expect(
      canRecordAttendanceOnScheduleDate({
        scheduleDateKey: '2026-09-21',
        todayKeyJst: '2026-09-20',
      }),
    ).toBe(false)
  })
})
