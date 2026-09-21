import { describe, expect, it } from 'vitest'
import {
  canRecordAttendanceOnScheduleDate,
  computeRemainingCounts,
  hasEffectiveAttended,
  latestStatusByLineage,
  resolveCurrentAttendanceStatus,
  resolveUnitEffectiveStatus,
} from '@/lib/class-course/remaining'

describe('lineage-based remaining (makeup scenario)', () => {
  it('S1 absent → S2 attended digests once; correcting S1 keeps digest', () => {
    const unit = 'u1'
    const s1 = 'session-s1'
    const s2 = 'session-s2'

    const afterS2: Parameters<typeof computeRemainingCounts>[0]['attendanceEvents'] = [
      { course_unit_id: unit, attendance_lineage_id: s2, status: 'attended', recorded_at: '2026-09-20T12:00:00Z' },
      { course_unit_id: unit, attendance_lineage_id: s1, status: 'absent', recorded_at: '2026-09-10T12:00:00Z' },
    ]
    expect(
      computeRemainingCounts({
        activeAssignmentUnitIds: [unit],
        attendanceEvents: afterS2,
      }),
    ).toEqual({ assignedCount: 1, attendedCount: 1, remainingCount: 0 })

    const afterCorrectS1 = [
      {
        course_unit_id: unit,
        attendance_lineage_id: s1,
        status: 'not_done' as const,
        recorded_at: '2026-09-21T12:00:00Z',
      },
      ...afterS2,
    ]
    expect(
      computeRemainingCounts({
        activeAssignmentUnitIds: [unit],
        attendanceEvents: afterCorrectS1,
      }),
    ).toEqual({ assignedCount: 1, attendedCount: 1, remainingCount: 0 })
    expect(hasEffectiveAttended(afterCorrectS1)).toBe(true)
    expect(latestStatusByLineage(afterCorrectS1).get(s1)).toBe('not_done')
    expect(latestStatusByLineage(afterCorrectS1).get(s2)).toBe('attended')

    const afterCorrectS2 = [
      {
        course_unit_id: unit,
        attendance_lineage_id: s2,
        status: 'not_done' as const,
        recorded_at: '2026-09-22T12:00:00Z',
      },
      ...afterCorrectS1,
    ]
    expect(
      computeRemainingCounts({
        activeAssignmentUnitIds: [unit],
        attendanceEvents: afterCorrectS2,
      }),
    ).toEqual({ assignedCount: 1, attendedCount: 0, remainingCount: 1 })
  })

  it('blocks treating another lineage as attended when one is already effective', () => {
    const events = [
      {
        course_unit_id: 'u1',
        attendance_lineage_id: 's2',
        status: 'attended' as const,
        recorded_at: '2026-09-20T12:00:00Z',
      },
      {
        course_unit_id: 'u1',
        attendance_lineage_id: 's1',
        status: 'absent' as const,
        recorded_at: '2026-09-10T12:00:00Z',
      },
    ]
    expect(hasEffectiveAttended(events)).toBe(true)
    expect(resolveUnitEffectiveStatus(events)).toBe('attended')
  })

  it('keeps deleted-session lineage id distinct from manual', () => {
    const events = [
      {
        course_unit_id: 'u1',
        attendance_lineage_id: 'former-session-uuid',
        status: 'attended' as const,
        recorded_at: '2026-09-20T12:00:00Z',
      },
      {
        course_unit_id: 'u1',
        attendance_lineage_id: 'manual-lineage',
        status: 'not_done' as const,
        recorded_at: '2026-09-21T12:00:00Z',
      },
    ]
    expect(latestStatusByLineage(events).size).toBe(2)
    expect(hasEffectiveAttended(events)).toBe(true)
  })
})

describe('resolveCurrentAttendanceStatus (single lineage)', () => {
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
