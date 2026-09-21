import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSuperAdminOrRedirect } from '@/lib/class-schedule/access'
import {
  CLASS_COURSE_FEE_KIND_LABELS,
  CLASS_COURSE_SUBJECT_LABELS,
  CLASS_COURSE_TERM_LABELS,
  CLASS_COURSE_TRACK_LABELS,
  resolveClassCourseFeeKind,
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
import { CancelAssignmentButton } from '@/components/class-course/CancelAssignmentButton'
import { StudentCourseLineagePanel } from '@/components/class-course/StudentCourseLineagePanel'

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
      <AdminPageShell title="生徒別 授業回数" backHref="/admin/class-schedule">
        <p className="text-sm text-red-600">{loaded.error}</p>
      </AdminPageShell>
    )
  }

  const label =
    profile.full_name || profile.display_name || profile.email || profile.id
  const todayKey = getJstDateKey()

  return (
    <AdminPageShell
      title={`${label} · 授業回数`}
      backHref="/admin/class-schedule/courses"
      backLabel="授業回数登録"
    >
      <AdminNarrowContent>
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">残回数（年度・時期・科目・枠）</h2>
          {loaded.summary.length === 0 ? (
            <p className="text-sm text-muted">割り当てはまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {loaded.summary.map((row) => {
                const fee = resolveClassCourseFeeKind(
                  row.term as ClassCourseTerm,
                  row.track as ClassCourseTrack,
                )
                return (
                  <li
                    key={`${row.academicYear}-${row.term}-${row.subject}-${row.track}`}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {row.academicYear}年度{' '}
                      {CLASS_COURSE_TERM_LABELS[row.term as ClassCourseTerm]}{' '}
                      {CLASS_COURSE_SUBJECT_LABELS[row.subject as ClassCourseSubject]}{' '}
                      （{CLASS_COURSE_TRACK_LABELS[row.track as ClassCourseTrack]} /{' '}
                      {CLASS_COURSE_FEE_KIND_LABELS[fee]}）
                    </p>
                    <p className="mt-1 text-muted">
                      割当 {row.assignedCount} · 実施 {row.attendedCount} · 残{' '}
                      {row.remainingCount}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">授業一覧と履歴</h2>
          <ul className="space-y-3">
            {loaded.rows.map((row) => (
              <li key={row.courseUnitId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.displayName}</p>
                    <p className="text-sm text-muted">
                      現在:{' '}
                      {row.currentStatus === 'attended'
                        ? '実施'
                        : row.currentStatus === 'absent'
                          ? '欠席'
                          : '未実施'}
                      {row.attended ? '（消化済み）' : ''}
                    </p>
                  </div>
                  <CancelAssignmentButton
                    studentId={studentId}
                    courseUnitId={row.courseUnitId}
                    disabled={row.currentStatus === 'attended'}
                  />
                </div>
                {row.events.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {row.events.map((ev, index) => (
                      <li key={`${row.courseUnitId}-${ev.recordedAt}-${index}`}>
                        {ev.eventDate} ·{' '}
                        {ev.status === 'attended'
                          ? '実施'
                          : ev.status === 'absent'
                            ? '欠席'
                            : '未実施'}
                        {' · '}
                        {ev.source === 'session'
                          ? ev.sessionId
                            ? 'コマ'
                            : 'コマ（削除済）'
                          : '手入力'}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <StudentCourseLineagePanel
                  studentId={studentId}
                  todayKey={todayKey}
                  courseUnitId={row.courseUnitId}
                  displayName={row.displayName}
                  lineages={row.lineages}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">実施を手入力</h2>
          <ManualAttendanceForm
            studentId={studentId}
            todayKey={todayKey}
            units={loaded.rows.map((r) => ({
              id: r.courseUnitId,
              label: r.displayName,
            }))}
          />
        </section>

        <p className="mt-8 text-sm">
          <Link href="/admin/students" className="text-primary underline">
            生徒一覧
          </Link>
        </p>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
