import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { QuizScheduleManager } from '@/components/schedule/AdminScheduleManagers'
import { fetchExamSchedulesWithTargetsByType } from '@/lib/schedule/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminQuizSchedulePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [exams, students] = await Promise.all([
    fetchExamSchedulesWithTargetsByType('quiz'),
    fetchStudentList(),
  ])

  const studentOptions = students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    display_name: s.display_name,
  }))

  return (
    <AdminPageShell title="小テスト登録" backHref="/admin/schedule" backLabel="スケジュール">
      <AdminNarrowContent>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">小テスト</h2>
          <p className="mb-6 text-sm text-muted">
            小テストの日程を登録します。対象の生徒を個別に選択できます。
          </p>
          <QuizScheduleManager exams={exams} students={studentOptions} />
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
