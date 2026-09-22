import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSuperAdminOrRedirect } from '@/lib/class-schedule/access'
import {
  buildClassCourseGroupHeading,
  buildClassCourseSelectLabel,
  compareClassCourseUnitOrder,
  type ClassCourseSubject,
  type ClassCourseTerm,
  type ClassCourseTrack,
} from '@/lib/class-course/catalog'
import { loadStudentCourseRemaining } from '@/app/class-course/attendance-actions'
import { createClient } from '@/lib/supabase/server'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { getJstDateKey } from '@/lib/study/dates'
import { ManualAttendanceForm } from '@/components/class-course/ManualAttendanceForm'
import { StudentCourseGroupTables } from '@/components/class-course/StudentCourseGroupTables'
import { computeRemainingCounts } from '@/lib/class-course/remaining'

export const dynamic = 'force-dynamic'

export default async function AdminClassCourseStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  await requireSuperAdminOrRedirect()
  const { studentId } = await params

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email')
    .eq('id', studentId)
    .maybeSingle()

  if (!profile) notFound()

  const loaded = await loadStudentCourseRemaining(studentId)
  if (!loaded.ok) {
    return (
      <AdminPageShell title="生徒別 授業回数" backHref="/admin/class-schedule/students">
        <p className="text-sm text-red-600">{loaded.error}</p>
      </AdminPageShell>
    )
  }

  const label =
    profile.full_name || profile.display_name || profile.email || profile.id
  const todayKey = getJstDateKey()

  const groupMap = new Map<
    string,
    {
      key: string
      heading: string
      academicYear: number
      term: ClassCourseTerm
      subject: ClassCourseSubject
      track: ClassCourseTrack
      rows: (typeof loaded.rows)[number][]
    }
  >()

  for (const row of loaded.rows) {
    const key = `${row.academicYear}:${row.term}:${row.subject}:${row.track}`
    const existing = groupMap.get(key)
    if (existing) {
      existing.rows.push(row)
      continue
    }
    groupMap.set(key, {
      key,
      heading: buildClassCourseGroupHeading({
        academicYear: row.academicYear,
        subject: row.subject as ClassCourseSubject,
        term: row.term as ClassCourseTerm,
        track: row.track as ClassCourseTrack,
      }),
      academicYear: row.academicYear,
      term: row.term as ClassCourseTerm,
      subject: row.subject as ClassCourseSubject,
      track: row.track as ClassCourseTrack,
      rows: [row],
    })
  }

  const groups = [...groupMap.values()]
    .map((g) => {
      const sortedRows = [...g.rows].sort((a, b) => a.seqNo - b.seqNo)
      const counts = computeRemainingCounts({
        activeAssignmentUnitIds: sortedRows.map((r) => r.courseUnitId),
        attendanceEvents: sortedRows.flatMap((r) =>
          r.events.map((e) => ({
            course_unit_id: r.courseUnitId,
            status: e.status,
            recorded_at: e.recordedAt,
            attendance_lineage_id: e.attendanceLineageId,
          })),
        ),
      })
      return {
        key: g.key,
        heading: g.heading,
        assignedCount: counts.assignedCount,
        attendedCount: counts.attendedCount,
        remainingCount: counts.remainingCount,
        rows: sortedRows,
        sortKey: {
          academicYear: g.academicYear,
          term: g.term,
          subject: g.subject,
          track: g.track,
          seqNo: 0,
        },
      }
    })
    .sort((a, b) => compareClassCourseUnitOrder(a.sortKey, b.sortKey))

  const manualUnits = loaded.rows.map((r) => ({
    id: r.courseUnitId,
    label: buildClassCourseSelectLabel({
      academicYear: r.academicYear,
      subject: r.subject as ClassCourseSubject,
      term: r.term as ClassCourseTerm,
      track: r.track as ClassCourseTrack,
      seqNo: r.seqNo,
    }),
  }))

  return (
    <AdminPageShell
      title={`${label} · 授業回数`}
      backHref="/admin/class-schedule/students"
      backLabel="生徒別 実施・残回数"
    >
      <AdminNarrowContent>
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">講座別の実施・残回数</h2>
          <StudentCourseGroupTables
            studentId={studentId}
            todayKey={todayKey}
            groups={groups.map(({ key, heading, assignedCount, attendedCount, remainingCount, rows }) => ({
              key,
              heading,
              assignedCount,
              attendedCount,
              remainingCount,
              rows,
            }))}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">実施を手入力</h2>
          <ManualAttendanceForm
            studentId={studentId}
            todayKey={todayKey}
            units={manualUnits}
          />
        </section>

        <p className="mt-8 text-sm">
          <Link href="/admin/class-schedule/courses" className="text-primary underline">
            授業回数登録
          </Link>
          {' · '}
          <Link href="/admin/students" className="text-primary underline">
            生徒一覧
          </Link>
        </p>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
