import { notFound } from 'next/navigation'
import { requireSuperAdminOrRedirect } from '@/lib/class-schedule/access'
import { fetchClassScheduleDayById } from '@/lib/class-schedule/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { canRecordAttendanceOnScheduleDate } from '@/lib/class-course/remaining'
import { resolveCurrentAttendanceStatus } from '@/lib/class-course/remaining'
import { getJstDateKey } from '@/lib/study/dates'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminClassScheduleEditPage } from '@/components/class-schedule/AdminClassScheduleEditPage'
import type { SessionAttendeeRow } from '@/components/class-course/AdminSessionAttendanceBar'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

export const dynamic = 'force-dynamic'

/** Soft budget for edit/cancel notification fan-out. */
export const maxDuration = 60

export default async function AdminClassScheduleDayPage({
  params,
}: {
  params: Promise<{ dayId: string }>
}) {
  await requireSuperAdminOrRedirect()
  const { dayId } = await params
  const day = await fetchClassScheduleDayById(dayId)
  if (!day) notFound()

  const admin = createAdminClient()
  const attendanceBySession = new Map<string, SessionAttendeeRow[]>()
  const todayKey = getJstDateKey()
  const canRecord = canRecordAttendanceOnScheduleDate({
    scheduleDateKey: day.schedule_date,
    todayKeyJst: todayKey,
  })

  if (admin) {
    const sessionIds = day.sessions
      .filter((s) => s.course_unit_id)
      .map((s) => s.id)
    if (sessionIds.length > 0) {
      const { data: attendees } = await admin
        .from('class_schedule_session_attendees')
        .select('session_id, student_id, profiles(full_name, display_name, email)')
        .in('session_id', sessionIds)

      for (const session of day.sessions) {
        if (!session.course_unit_id) continue
        const rows = (attendees ?? []).filter((a) => a.session_id === session.id)
        const studentIds = rows.map((r) => String(r.student_id))
        const { data: events } =
          studentIds.length > 0
            ? await admin
                .from('class_course_attendance_events')
                .select('student_id, status, recorded_at, attendance_lineage_id')
                .eq('course_unit_id', session.course_unit_id)
                .in('student_id', studentIds)
                .order('recorded_at', { ascending: false })
            : { data: [] as { student_id: string; status: string; attendance_lineage_id: string }[] }

        attendanceBySession.set(
          session.id,
          rows.map((row) => {
            const profileRaw = row.profiles
            const profile = (
              Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
            ) as {
              full_name?: string
              display_name?: string
              email?: string
            } | null
            const studentEvents = (events ?? []).filter(
              (e) =>
                e.student_id === row.student_id &&
                String(e.attendance_lineage_id) === session.id,
            )
            return {
              studentId: String(row.student_id),
              label:
                profile?.full_name ||
                profile?.display_name ||
                profile?.email ||
                String(row.student_id),
              courseUnitId: String(session.course_unit_id),
              currentStatus: resolveCurrentAttendanceStatus(
                studentEvents.map((e) => ({
                  status: e.status as ClassCourseAttendanceStatus,
                })),
              ),
            }
          }),
        )
      }
    }
  }

  return (
    <AdminPageShell
      title="授業日の編集"
      backHref="/admin/class-schedule"
      backLabel="授業予定"
    >
      <AdminNarrowContent>
        <AdminClassScheduleEditPage
          day={day}
          attendanceBySession={Object.fromEntries(attendanceBySession)}
          canRecordAttendance={canRecord}
        />
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
