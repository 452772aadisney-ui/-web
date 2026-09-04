import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { HomeworkTaskManager } from '@/components/schedule/AdminScheduleManagers'
import { fetchHomeworkTasksWithTargets } from '@/lib/schedule/queries'
import { fetchAllHomeworkCompletions } from '@/lib/todo/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminHomeworkSchedulePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [homework, completions, students] = await Promise.all([
    fetchHomeworkTasksWithTargets(),
    fetchAllHomeworkCompletions(),
    fetchStudentList(),
  ])

  const studentOptions = students.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    display_name: s.display_name,
  }))

  return (
    <AdminPageShell title="課題登録" backHref="/admin/schedule" backLabel="スケジュール">
      <AdminNarrowContent>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">課題・宿題</h2>
          <p className="mb-6 text-sm text-muted">
            教科別・期日付きの課題や宿題を登録します。生徒が完了チェックすると下の表に反映されます。
          </p>
          <HomeworkTaskManager
            tasks={homework}
            students={studentOptions}
            completions={completions}
          />
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
