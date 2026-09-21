import type { ClassCourseAttendanceStatus } from '@/types/class-course'

/**
 * 残回数: 有効割当数 − 実施消化数。
 * 消化 = その生徒×共通授業に attended イベントが1件以上（二重消化しない）。
 */
export function computeRemainingCounts(params: {
  activeAssignmentUnitIds: readonly string[]
  attendanceEvents: readonly {
    course_unit_id: string
    status: ClassCourseAttendanceStatus
  }[]
}): { assignedCount: number; attendedCount: number; remainingCount: number } {
  const assigned = new Set(params.activeAssignmentUnitIds)
  const attendedUnits = new Set<string>()
  for (const ev of params.attendanceEvents) {
    if (ev.status === 'attended' && assigned.has(ev.course_unit_id)) {
      attendedUnits.add(ev.course_unit_id)
    }
  }
  const assignedCount = assigned.size
  const attendedCount = attendedUnits.size
  return {
    assignedCount,
    attendedCount,
    remainingCount: Math.max(0, assignedCount - attendedCount),
  }
}

/** 最新イベントを現在状態とする。イベントなしは未実施。 */
export function resolveCurrentAttendanceStatus(
  eventsNewestFirst: readonly { status: ClassCourseAttendanceStatus }[],
): ClassCourseAttendanceStatus {
  const latest = eventsNewestFirst[0]
  return latest?.status ?? 'not_done'
}

export function canRecordAttendanceOnScheduleDate(params: {
  scheduleDateKey: string
  todayKeyJst: string
}): boolean {
  return params.scheduleDateKey <= params.todayKeyJst
}
