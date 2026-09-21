'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/class-schedule/access'
import { requireAdminClassScheduleRpcClient } from '@/lib/class-schedule/rpc-auth'
import { canRecordAttendanceOnScheduleDate } from '@/lib/class-course/remaining'
import { getJstDateKey } from '@/lib/study/dates'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

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

  revalidatePath('/admin/class-schedule')
  revalidatePath(`/admin/class-schedule/students/${params.studentId}`)
  return { ok: true }
}

export async function recordClassCourseAttendanceForAllAttendees(params: {
  sessionId: string
  courseUnitId: string
  eventDate: string
}): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }

  const { data: attendees } = await gate.admin
    .from('class_schedule_session_attendees')
    .select('student_id')
    .eq('session_id', params.sessionId)

  const studentIds = [...new Set((attendees ?? []).map((a) => String(a.student_id)))]
  let saved = 0
  for (const studentId of studentIds) {
    const result = await recordClassCourseAttendance({
      courseUnitId: params.courseUnitId,
      studentId,
      status: 'attended',
      eventDate: params.eventDate,
      sessionId: params.sessionId,
    })
    if (result.ok) saved += 1
  }
  return { ok: true, saved }
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
