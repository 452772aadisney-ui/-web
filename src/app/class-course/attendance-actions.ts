'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/class-schedule/access'
import { requireAdminClassScheduleRpcClient } from '@/lib/class-schedule/rpc-auth'
import { canRecordAttendanceOnScheduleDate } from '@/lib/class-course/remaining'
import {
  attendeeRemoveErrorMessage,
  assignmentCancelErrorMessage,
  canCancelClassCourseAssignment,
  canRemoveSessionAttendee,
  planBulkMarkAttended,
  summarizeBulkAttendResult,
} from '@/lib/class-course/guards'
import { getJstDateKey } from '@/lib/study/dates'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

function revalidateAttendancePaths(studentId?: string, dayId?: string) {
  revalidatePath('/admin/class-schedule')
  revalidatePath('/admin/class-schedule/courses')
  if (studentId) {
    revalidatePath(`/admin/class-schedule/students/${studentId}`)
  }
  if (dayId) {
    revalidatePath(`/admin/class-schedule/${dayId}`)
  }
}

export async function recordClassCourseAttendance(params: {
  courseUnitId: string
  studentId: string
  status: ClassCourseAttendanceStatus
  eventDate: string
  sessionId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const todayKey = getJstDateKey()
  if (
    !canRecordAttendanceOnScheduleDate({
      scheduleDateKey: params.eventDate,
      todayKeyJst: todayKey,
    })
  ) {
    return { ok: false, error: '未来日の実施・欠席は登録できません' }
  }

  if (params.sessionId) {
    const { data: session } = await gate.admin
      .from('class_schedule_sessions')
      .select('id, status, day_id, class_schedule_days(status, schedule_date)')
      .eq('id', params.sessionId)
      .maybeSingle()

    if (!session) return { ok: false, error: 'コマが見つかりません' }

    const day = session.class_schedule_days as
      | { status?: string; schedule_date?: string }
      | { status?: string; schedule_date?: string }[]
      | null
    const dayRow = Array.isArray(day) ? day[0] : day
    if (dayRow?.status === 'cancelled' || session.status === 'cancelled') {
      if (params.status !== 'not_done') {
        return { ok: false, error: '中止コマには新規の実施・欠席を付けられません' }
      }
    }
  }

  const { data: assignment } = await gate.admin
    .from('class_course_assignments')
    .select('id')
    .eq('course_unit_id', params.courseUnitId)
    .eq('student_id', params.studentId)
    .eq('status', 'active')
    .maybeSingle()

  if (!assignment?.id) {
    return { ok: false, error: '有効な割り当てがありません' }
  }

  const { error } = await gate.admin.from('class_course_attendance_events').insert({
    course_unit_id: params.courseUnitId,
    student_id: params.studentId,
    assignment_id: assignment.id,
    status: params.status,
    event_date: params.eventDate,
    session_id: params.sessionId ?? null,
    recorded_by: gate.profile.id,
  })

  if (error) {
    console.error('[class-course] attendance insert failed', error.code)
    return { ok: false, error: '保存に失敗しました' }
  }

  revalidateAttendancePaths(params.studentId)
  return { ok: true }
}

export async function recordClassCourseAttendanceForAllAttendees(params: {
  sessionId: string
  courseUnitId: string
  eventDate: string
}): Promise<
  | { ok: true; message: string; saved: number; skipped: number }
  | { ok: false; error: string }
> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const todayKey = getJstDateKey()
  if (
    !canRecordAttendanceOnScheduleDate({
      scheduleDateKey: params.eventDate,
      todayKeyJst: todayKey,
    })
  ) {
    return { ok: false, error: '未来日の実施は登録できません' }
  }

  const { data: session } = await gate.admin
    .from('class_schedule_sessions')
    .select('id, status, course_unit_id, class_schedule_days(status, schedule_date)')
    .eq('id', params.sessionId)
    .maybeSingle()

  if (!session) return { ok: false, error: 'コマが見つかりません' }
  const day = session.class_schedule_days as
    | { status?: string; schedule_date?: string }
    | { status?: string; schedule_date?: string }[]
    | null
  const dayRow = Array.isArray(day) ? day[0] : day
  if (dayRow?.status === 'cancelled' || session.status === 'cancelled') {
    return { ok: false, error: '中止コマでは一括実施できません' }
  }
  if (String(session.course_unit_id) !== params.courseUnitId) {
    return { ok: false, error: '共通授業が一致しません' }
  }

  const { data: attendees } = await gate.admin
    .from('class_schedule_session_attendees')
    .select('student_id')
    .eq('session_id', params.sessionId)

  const studentIds = [...new Set((attendees ?? []).map((a) => String(a.student_id)))]
  if (studentIds.length === 0) {
    return { ok: false, error: '対象生徒がいません' }
  }

  const { data: events } = await gate.admin
    .from('class_course_attendance_events')
    .select('student_id, status, recorded_at')
    .eq('course_unit_id', params.courseUnitId)
    .in('student_id', studentIds)
    .order('recorded_at', { ascending: false })

  const latestByStudent = new Map<string, ClassCourseAttendanceStatus>()
  for (const ev of events ?? []) {
    const sid = String(ev.student_id)
    if (!latestByStudent.has(sid)) {
      latestByStudent.set(sid, ev.status as ClassCourseAttendanceStatus)
    }
  }

  const plan = planBulkMarkAttended(
    studentIds.map((studentId) => ({
      studentId,
      label: studentId,
      currentStatus: latestByStudent.get(studentId) ?? 'not_done',
    })),
  )

  let saved = 0
  let failed = 0
  for (const row of plan.toSave) {
    const result = await recordClassCourseAttendance({
      courseUnitId: params.courseUnitId,
      studentId: row.studentId,
      status: 'attended',
      eventDate: params.eventDate,
      sessionId: params.sessionId,
    })
    if (result.ok) saved += 1
    else failed += 1
  }

  const summary = summarizeBulkAttendResult({
    attempted: plan.toSave.length,
    saved,
    skippedAlreadyAttended: plan.alreadyAttended.length,
    failed,
  })

  revalidateAttendancePaths(undefined)
  if (!summary.ok) return summary
  return {
    ok: true,
    message: summary.message,
    saved,
    skipped: plan.alreadyAttended.length,
  }
}

export async function previewBulkMarkAttended(params: {
  sessionId: string
  courseUnitId: string
}): Promise<
  | {
      ok: true
      toSaveCount: number
      absentLabels: string[]
      alreadyAttendedCount: number
    }
  | { ok: false; error: string }
> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { ok: false, error: access.error }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: '読み込みに失敗しました' }

  const { data: attendees } = await admin
    .from('class_schedule_session_attendees')
    .select('student_id, profiles(full_name, display_name, email)')
    .eq('session_id', params.sessionId)

  const rows = attendees ?? []
  const studentIds = rows.map((r) => String(r.student_id))
  const { data: events } =
    studentIds.length > 0
      ? await admin
          .from('class_course_attendance_events')
          .select('student_id, status, recorded_at')
          .eq('course_unit_id', params.courseUnitId)
          .in('student_id', studentIds)
          .order('recorded_at', { ascending: false })
      : { data: [] as never[] }

  const latestByStudent = new Map<string, ClassCourseAttendanceStatus>()
  for (const ev of events ?? []) {
    const sid = String(ev.student_id)
    if (!latestByStudent.has(sid)) {
      latestByStudent.set(sid, ev.status as ClassCourseAttendanceStatus)
    }
  }

  const labeled = rows.map((row) => {
    const profileRaw = row.profiles
    const profile = (
      Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    ) as {
      full_name?: string
      display_name?: string
      email?: string
    } | null
    return {
      studentId: String(row.student_id),
      label:
        profile?.full_name ||
        profile?.display_name ||
        profile?.email ||
        String(row.student_id),
      currentStatus: latestByStudent.get(String(row.student_id)) ?? 'not_done',
    }
  })

  const plan = planBulkMarkAttended(labeled)
  return {
    ok: true,
    toSaveCount: plan.toSave.length,
    absentLabels: plan.absentToCorrect.map((p) => p.label),
    alreadyAttendedCount: plan.alreadyAttended.length,
  }
}

export async function removeSessionAttendee(params: {
  sessionId: string
  studentId: string
  courseUnitId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { data: events } = await gate.admin
    .from('class_course_attendance_events')
    .select('status, recorded_at')
    .eq('course_unit_id', params.courseUnitId)
    .eq('student_id', params.studentId)
    .order('recorded_at', { ascending: false })

  const guard = canRemoveSessionAttendee({
    eventsNewestFirst: (events ?? []).map((e) => ({
      status: e.status as ClassCourseAttendanceStatus,
    })),
  })
  if (!guard.ok) {
    return { ok: false, error: attendeeRemoveErrorMessage() }
  }

  const { error } = await gate.admin.rpc('remove_class_schedule_session_attendee', {
    p_session_id: params.sessionId,
    p_student_id: params.studentId,
    p_actor_id: gate.profile.id,
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('attendance record')) {
      return { ok: false, error: attendeeRemoveErrorMessage() }
    }
    return { ok: false, error: '対象外しに失敗しました' }
  }

  revalidateAttendancePaths(params.studentId)
  return { ok: true }
}

export async function cancelClassCourseAssignment(params: {
  courseUnitId: string
  studentId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { data: events } = await gate.admin
    .from('class_course_attendance_events')
    .select('status, recorded_at')
    .eq('course_unit_id', params.courseUnitId)
    .eq('student_id', params.studentId)
    .order('recorded_at', { ascending: false })

  const { count } = await gate.admin
    .from('class_schedule_session_attendees')
    .select('id, class_schedule_sessions!inner(course_unit_id)', {
      count: 'exact',
      head: true,
    })
    .eq('student_id', params.studentId)
    .eq('class_schedule_sessions.course_unit_id', params.courseUnitId)

  const guard = canCancelClassCourseAssignment({
    eventsNewestFirst: (events ?? []).map((e) => ({
      status: e.status as ClassCourseAttendanceStatus,
    })),
    sessionAttendeeCount: count ?? 0,
  })
  if (!guard.ok) {
    return { ok: false, error: assignmentCancelErrorMessage(guard.reason) }
  }

  const { error } = await gate.admin.rpc('cancel_class_course_assignment', {
    p_course_unit_id: params.courseUnitId,
    p_student_id: params.studentId,
    p_actor_id: gate.profile.id,
  })

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('attended')) {
      return { ok: false, error: assignmentCancelErrorMessage('has_attended') }
    }
    if (msg.includes('session attendees')) {
      return { ok: false, error: assignmentCancelErrorMessage('still_on_sessions') }
    }
    return { ok: false, error: '割当の取消に失敗しました' }
  }

  revalidateAttendancePaths(params.studentId)
  return { ok: true }
}

export async function loadStudentCourseRemaining(studentId: string): Promise<{
  ok: true
  rows: {
    courseUnitId: string
    displayName: string
    academicYear: number
    term: string
    subject: string
    track: string
    seqNo: number
    currentStatus: ClassCourseAttendanceStatus
    attended: boolean
    events: {
      status: ClassCourseAttendanceStatus
      eventDate: string
      recordedAt: string
    }[]
  }[]
  summary: {
    academicYear: number
    term: string
    subject: string
    track: string
    assignedCount: number
    attendedCount: number
    remainingCount: number
  }[]
} | { ok: false; error: string }> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { ok: false, error: access.error }
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: '読み込みに失敗しました' }

  const { data: assignments, error } = await admin
    .from('class_course_assignments')
    .select(
      'id, course_unit_id, class_course_units(id, academic_year, term, subject, track, seq_no)',
    )
    .eq('student_id', studentId)
    .eq('status', 'active')

  if (error) return { ok: false, error: '割当の取得に失敗しました' }

  const unitIds = (assignments ?? []).map((a) => String(a.course_unit_id))
  const { data: events } = unitIds.length
    ? await admin
        .from('class_course_attendance_events')
        .select('course_unit_id, status, event_date, recorded_at')
        .eq('student_id', studentId)
        .in('course_unit_id', unitIds)
        .order('recorded_at', { ascending: false })
    : { data: [] as never[] }

  const { buildClassCourseDisplayName } = await import('@/lib/class-course/catalog')
  const { computeRemainingCounts, resolveCurrentAttendanceStatus } = await import(
    '@/lib/class-course/remaining'
  )

  const eventsByUnit = new Map<string, typeof events>()
  for (const ev of events ?? []) {
    const key = String(ev.course_unit_id)
    const list = eventsByUnit.get(key) ?? []
    list.push(ev)
    eventsByUnit.set(key, list)
  }

  const rows = (assignments ?? []).map((a) => {
    const unitRaw = a.class_course_units
    const unit = (Array.isArray(unitRaw) ? unitRaw[0] : unitRaw) as {
      id: string
      academic_year: number
      term: string
      subject: string
      track: string
      seq_no: number
    } | null
    const unitEvents = eventsByUnit.get(String(a.course_unit_id)) ?? []
    const currentStatus = resolveCurrentAttendanceStatus(
      unitEvents.map((e) => ({ status: e.status as ClassCourseAttendanceStatus })),
    )
    const attended = unitEvents.some((e) => e.status === 'attended')
    return {
      courseUnitId: String(a.course_unit_id),
      displayName: unit
        ? buildClassCourseDisplayName({
            subject: unit.subject as never,
            term: unit.term as never,
            track: unit.track as never,
            seqNo: Number(unit.seq_no),
          })
        : String(a.course_unit_id),
      academicYear: Number(unit?.academic_year ?? 0),
      term: String(unit?.term ?? ''),
      subject: String(unit?.subject ?? ''),
      track: String(unit?.track ?? ''),
      seqNo: Number(unit?.seq_no ?? 0),
      currentStatus,
      attended,
      events: unitEvents.map((e) => ({
        status: e.status as ClassCourseAttendanceStatus,
        eventDate: String(e.event_date),
        recordedAt: String(e.recorded_at),
      })),
    }
  })

  const groups = new Map<
    string,
    { academicYear: number; term: string; subject: string; track: string; unitIds: string[] }
  >()
  for (const row of rows) {
    const key = `${row.academicYear}:${row.term}:${row.subject}:${row.track}`
    const g = groups.get(key) ?? {
      academicYear: row.academicYear,
      term: row.term,
      subject: row.subject,
      track: row.track,
      unitIds: [],
    }
    g.unitIds.push(row.courseUnitId)
    groups.set(key, g)
  }

  const summary = [...groups.values()].map((g) => {
    const counts = computeRemainingCounts({
      activeAssignmentUnitIds: g.unitIds,
      attendanceEvents: (events ?? []).map((e) => ({
        course_unit_id: String(e.course_unit_id),
        status: e.status as ClassCourseAttendanceStatus,
      })),
    })
    return {
      academicYear: g.academicYear,
      term: g.term,
      subject: g.subject,
      track: g.track,
      ...counts,
    }
  })

  return { ok: true, rows, summary }
}
