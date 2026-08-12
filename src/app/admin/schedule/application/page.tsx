import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { ApplicationTaskManager } from '@/components/schedule/AdminScheduleManagers'
import { fetchApplicationTasksWithTargets } from '@/lib/todo/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminApplicationSchedulePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [applications, students] = await Promise.all([
    fetchApplicationTasksWithTargets(),
    fetchStudentList(),
  ])

  const studentOptions = students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    display_name: s.display_name,
  }))

  return (
    <AdminPageShell title="申込・タスク登録" backHref="/admin/schedule" backLabel="スケジュール">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">申込・タスク</h2>
        <p className="mb-6 text-sm text-muted">
          出願・申込などの期限付きタスクを登録します。対象の生徒を個別に選択できます。
        </p>
        <ApplicationTaskManager tasks={applications} students={studentOptions} />
      </section>
    </AdminPageShell>
  )
}
