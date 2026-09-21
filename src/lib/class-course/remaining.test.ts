import { describe, expect, it } from 'vitest'
import {
  canRecordAttendanceOnScheduleDate,
  computeRemainingCounts,
  isAlreadyEffectivelyAttended,
  resolveCurrentAttendanceStatus,
} from '@/lib/class-course/remaining'

describe('computeRemainingCounts', () => {
  it('uses latest status so attended→not_done restores remaining', () => {
    const result = computeRemainingCounts({
      activeAssignmentUnitIds: ['u1', 'u2'],
      attendanceEvents: [
        // newest first
        { course_unit_id: 'u1', status: 'not_done', recorded_at: '2026-09-21T12:00:00Z' },
        { course_unit_id: 'u1', status: 'attended', recorded_at: '2026-09-20T12:00:00Z' },
        { course_unit_id: 'u2', status: 'attended', recorded_at: '2026-09-19T12:00:00Z' },
      ],
    })
    expect(result).toEqual({
      assignedCount: 2,
      attendedCount: 1,
      remainingCount: 1,
    })
  })

  it('digests once for absent→attended makeup', () => {
    const result = computeRemainingCounts({
      activeAssignmentUnitIds: ['u1'],
      attendanceEvents: [
        { course_unit_id: 'u1', status: 'attended', recorded_at: '2026-09-21T12:00:00Z' },
        { course_unit_id: 'u1', status: 'absent', recorded_at: '2026-09-10T12:00:00Z' },
      ],
    })
    expect(result).toEqual({
      assignedCount: 1,
      attendedCount: 1,
      remainingCount: 0,
    })
  })

  it('does not digest when latest is absent even if older attended exists', () => {
    const result = computeRemainingCounts({
      activeAssignmentUnitIds: ['u1'],
      attendanceEvents: [
        { course_unit_id: 'u1', status: 'absent', recorded_at: '2026-09-21T12:00:00Z' },
        { course_unit_id: 'u1', status: 'attended', recorded_at: '2026-09-10T12:00:00Z' },
      ],
    })
    expect(result.attendedCount).toBe(0)
    expect(result.remainingCount).toBe(1)
  })
})

describe('resolveCurrentAttendanceStatus', () => {
  it('defaults to not_done', () => {
    expect(resolveCurrentAttendanceStatus([])).toBe('not_done')
  })
})

describe('isAlreadyEffectivelyAttended', () => {
  it('true only when latest is attended', () => {
    expect(
      isAlreadyEffectivelyAttended([
        { status: 'not_done' },
        { status: 'attended' },
      ]),
    ).toBe(false)
    expect(isAlreadyEffectivelyAttended([{ status: 'attended' }])).toBe(true)
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
