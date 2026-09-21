import type { ClassCourseAttendanceStatus } from '@/types/class-course'

export type AttendanceEventForRemaining = {
  course_unit_id: string
  status: ClassCourseAttendanceStatus
  recorded_at?: string
  /** Same-session corrections share this id (survives session delete). */
  attendance_lineage_id: string
}

type LatestRow = {
  status: ClassCourseAttendanceStatus
  recordedAt: string | null
  order: number
}

function isNewerCandidate(
  next: { recordedAt: string | null; order: number },
  prev: LatestRow,
): boolean {
  if (next.recordedAt != null) {
    return prev.recordedAt == null || next.recordedAt > prev.recordedAt
  }
  if (prev.recordedAt != null) return false
  return next.order < prev.order
}

/** Latest status per attendance_lineage_id (within one student×unit event set). */
export function latestStatusByLineage(
  events: readonly AttendanceEventForRemaining[],
): Map<string, ClassCourseAttendanceStatus> {
  const latest = new Map<string, LatestRow>()
  events.forEach((ev, index) => {
    const key = ev.attendance_lineage_id
    const candidate = {
      status: ev.status,
      recordedAt: ev.recorded_at ?? null,
      order: index,
    }
    const prev = latest.get(key)
    if (!prev || isNewerCandidate(candidate, prev)) {
      latest.set(key, candidate)
    }
  })
  const out = new Map<string, ClassCourseAttendanceStatus>()
  for (const [id, row] of latest) out.set(id, row.status)
  return out
}

/** True when any lineage's latest status is attended (cap: one digest per unit). */
export function hasEffectiveAttended(
  events: readonly AttendanceEventForRemaining[],
): boolean {
  for (const status of latestStatusByLineage(events).values()) {
    if (status === 'attended') return true
  }
  return false
}

/**
 * 残回数: 有効割当数 − 消化数。
 * 消化 = 生徒×共通授業について、いずれかの lineage 最新が attended（最大1）。
 * 別コマ lineage の訂正は互いに打ち消さない。
 */
export function computeRemainingCounts(params: {
  activeAssignmentUnitIds: readonly string[]
  attendanceEvents: readonly AttendanceEventForRemaining[]
}): { assignedCount: number; attendedCount: number; remainingCount: number } {
  const assigned = new Set(params.activeAssignmentUnitIds)
  const byUnit = new Map<string, AttendanceEventForRemaining[]>()

  for (const ev of params.attendanceEvents) {
    if (!assigned.has(ev.course_unit_id)) continue
    const list = byUnit.get(ev.course_unit_id) ?? []
    list.push(ev)
    byUnit.set(ev.course_unit_id, list)
  }

  let attendedCount = 0
  for (const unitId of assigned) {
    if (hasEffectiveAttended(byUnit.get(unitId) ?? [])) attendedCount += 1
  }

  const assignedCount = assigned.size
  return {
    assignedCount,
    attendedCount,
    remainingCount: Math.max(0, assignedCount - attendedCount),
  }
}

/** Unit-level display: attended if any lineage attended; else absent if any; else not_done. */
export function resolveUnitEffectiveStatus(
  events: readonly AttendanceEventForRemaining[],
): ClassCourseAttendanceStatus {
  const statuses = [...latestStatusByLineage(events).values()]
  if (statuses.some((s) => s === 'attended')) return 'attended'
  if (statuses.some((s) => s === 'absent')) return 'absent'
  return 'not_done'
}

/** Latest event within one lineage (newest-first array). */
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

export function isAlreadyEffectivelyAttended(
  events: readonly AttendanceEventForRemaining[],
): boolean {
  return hasEffectiveAttended(events)
}
