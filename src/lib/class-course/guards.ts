/**
 * Pure helpers for bulk «全員を実施» and attendee/assignment guards.
 */

import type { ClassCourseAttendanceStatus } from '@/types/class-course'
import { resolveCurrentAttendanceStatus } from '@/lib/class-course/remaining'

export type BulkAttendStudentPlan = {
  studentId: string
  label: string
  currentStatus: ClassCourseAttendanceStatus
  action: 'mark_attended' | 'correct_absent_to_attended' | 'skip_already_attended'
}

export function planBulkMarkAttended(
  attendees: readonly {
    studentId: string
    label: string
    currentStatus: ClassCourseAttendanceStatus
  }[],
): {
  plans: BulkAttendStudentPlan[]
  toSave: BulkAttendStudentPlan[]
  absentToCorrect: BulkAttendStudentPlan[]
  alreadyAttended: BulkAttendStudentPlan[]
} {
  const plans: BulkAttendStudentPlan[] = attendees.map((row) => {
    if (row.currentStatus === 'attended') {
      return { ...row, action: 'skip_already_attended' as const }
    }
    if (row.currentStatus === 'absent') {
      return { ...row, action: 'correct_absent_to_attended' as const }
    }
    return { ...row, action: 'mark_attended' as const }
  })
  return {
    plans,
    toSave: plans.filter((p) => p.action !== 'skip_already_attended'),
    absentToCorrect: plans.filter(
      (p) => p.action === 'correct_absent_to_attended',
    ),
    alreadyAttended: plans.filter((p) => p.action === 'skip_already_attended'),
  }
}

export function summarizeBulkAttendResult(params: {
  attempted: number
  saved: number
  skippedAlreadyAttended: number
  failed: number
}): { ok: true; message: string } | { ok: false; error: string } {
  if (params.failed > 0) {
    return {
      ok: false,
      error: `一部のみ保存されました（成功 ${params.saved} / 失敗 ${params.failed}）。画面を確認してください`,
    }
  }
  if (params.attempted === 0) {
    return {
      ok: true,
      message:
        params.skippedAlreadyAttended > 0
          ? `対象はすでに実施済みです（${params.skippedAlreadyAttended}名）`
          : '対象生徒がいません',
    }
  }
  const skipNote =
    params.skippedAlreadyAttended > 0
      ? `（実施済みスキップ ${params.skippedAlreadyAttended}名）`
      : ''
  return {
    ok: true,
    message: `${params.saved}名を実施にしました${skipNote}`,
  }
}

/** Latest status blocks remove when attended or absent. */
export function canRemoveSessionAttendee(params: {
  eventsNewestFirst: readonly { status: ClassCourseAttendanceStatus }[]
}): { ok: true } | { ok: false; reason: 'has_attendance_record' } {
  const current = resolveCurrentAttendanceStatus(params.eventsNewestFirst)
  if (current === 'attended' || current === 'absent') {
    return { ok: false, reason: 'has_attendance_record' }
  }
  return { ok: true }
}

/** Assignment cancel requires current not attended and no session targeting. */
export function canCancelClassCourseAssignment(params: {
  eventsNewestFirst: readonly { status: ClassCourseAttendanceStatus }[]
  sessionAttendeeCount: number
}):
  | { ok: true }
  | {
      ok: false
      reason: 'has_attended' | 'still_on_sessions'
    } {
  const current = resolveCurrentAttendanceStatus(params.eventsNewestFirst)
  if (current === 'attended') {
    return { ok: false, reason: 'has_attended' }
  }
  if (params.sessionAttendeeCount > 0) {
    return { ok: false, reason: 'still_on_sessions' }
  }
  return { ok: true }
}

export function assignmentCancelErrorMessage(
  reason: 'has_attended' | 'still_on_sessions',
): string {
  if (reason === 'has_attended') {
    return '実施済みのため、先に未実施へ訂正してから割当を取り消してください'
  }
  return '予定コマの対象に残っているため、先に対象から外してから割当を取り消してください'
}

export function attendeeRemoveErrorMessage(): string {
  return '実施または欠席の記録があるため、先に未実施へ訂正してから対象外してください'
}
