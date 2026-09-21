import type { ClassCourseAttendanceStatus } from '@/types/class-course'

/**
 * 残回数: 有効割当数 − 現在実施消化数。
 * 消化 = その生徒×共通授業の「最新」status が attended（過去の attended が残っても
 * 最新が not_done / absent なら未消化）。
 */
export function computeRemainingCounts(params: {
  activeAssignmentUnitIds: readonly string[]
  /** Newest-first overall, or include recorded_at for sorting. */
  attendanceEvents: readonly {
    course_unit_id: string
    status: ClassCourseAttendanceStatus
    recorded_at?: string
  }[]
}): { assignedCount: number; attendedCount: number; remainingCount: number } {
  const assigned = new Set(params.activeAssignmentUnitIds)
  const latestByUnit = new Map<
    string,
    { status: ClassCourseAttendanceStatus; recordedAt: string | null; order: number }
  >()

  params.attendanceEvents.forEach((ev, index) => {
    if (!assigned.has(ev.course_unit_id)) return
    const recordedAt = ev.recorded_at ?? null
    const prev = latestByUnit.get(ev.course_unit_id)
    if (!prev) {
      latestByUnit.set(ev.course_unit_id, {
        status: ev.status,
        recordedAt,
        order: index,
      })
      return
    }

    if (recordedAt != null) {
      if (prev.recordedAt == null || recordedAt > prev.recordedAt) {
        latestByUnit.set(ev.course_unit_id, {
          status: ev.status,
          recordedAt,
          order: index,
        })
      }
      return
    }

    if (prev.recordedAt != null) {
      // Prefer the timestamped candidate already kept.
      return
    }

    // No timestamps: treat earlier array index as newer (newest-first contract).
    if (index < prev.order) {
      latestByUnit.set(ev.course_unit_id, {
        status: ev.status,
        recordedAt: null,
        order: index,
      })
    }
  })

  let attendedCount = 0
  for (const row of latestByUnit.values()) {
    if (row.status === 'attended') attendedCount += 1
  }

  const assignedCount = assigned.size
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

/** True when the latest status is already attended (duplicate effective attend). */
export function isAlreadyEffectivelyAttended(
  eventsNewestFirst: readonly { status: ClassCourseAttendanceStatus }[],
): boolean {
  return resolveCurrentAttendanceStatus(eventsNewestFirst) === 'attended'
}
