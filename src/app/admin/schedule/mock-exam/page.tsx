import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { MockExamScheduleManager } from '@/components/schedule/AdminScheduleManagers'
import { fetchExamSchedulesWithTargetsByType } from '@/lib/schedule/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminMockExamSchedulePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [exams, students] = await Promise.all([
    fetchExamSchedulesWithTargetsByType('mock_exam'),
    fetchStudentList(),
  ])

  const studentOptions = students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    display_name: s.display_name,
  }))

  return (
    <AdminPageShell title="模試登録" backHref="/admin/schedule" backLabel="スケジュール">
      <AdminNarrowContent>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">模試</h2>
          <p className="mb-6 text-sm text-muted">
            受験日と返却日を登録します。両方が生徒のカレンダーに表示されます。
          </p>
          <MockExamScheduleManager exams={exams} students={studentOptions} />
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
