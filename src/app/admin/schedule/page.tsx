import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'

import { getDashboardPathForRole } from '@/lib/auth/routes'

import { AdminPageShell } from '@/components/layout/AdminPageShell'

import {

  ExamScheduleManager,

  HomeworkTaskManager,

  ApplicationTaskManager,

} from '@/components/schedule/AdminScheduleManagers'

import {

  fetchExamSchedulesWithTargets,

  fetchHomeworkTasksWithTargets,

} from '@/lib/schedule/queries'

import { fetchAllHomeworkCompletions, fetchApplicationTasksWithTargets } from '@/lib/todo/queries'

import { fetchStudentList } from '@/lib/study/queries'



export default async function AdminSchedulePage() {

  const profile = await getCurrentProfile()



  if (!profile) redirect('/login')

  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))



  const [exams, homework, applications, completions, students] = await Promise.all([

    fetchExamSchedulesWithTargets(),

    fetchHomeworkTasksWithTargets(),

    fetchApplicationTasksWithTargets(),

    fetchAllHomeworkCompletions(),

    fetchStudentList(),

  ])



  const studentOptions = students.map((s) => ({

    id: s.id,

    full_name: s.full_name,

    display_name: s.display_name,

  }))



  return (

    <AdminPageShell title="スケジュール管理" backHref="/admin" backLabel="管理画面">

      <div className="space-y-8">

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">

          <h2 className="mb-1 text-lg font-bold">模試・小テスト</h2>

          <p className="mb-6 text-sm text-muted">

            模試・小テストのスケジュールを登録します。対象の生徒を個別に選択できます。

          </p>

          <ExamScheduleManager exams={exams} students={studentOptions} />

        </section>



        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">

          <h2 className="mb-1 text-lg font-bold">宿題・タスク</h2>

          <p className="mb-6 text-sm text-muted">

            教科別・期日付きの宿題やタスクを登録します。生徒が完了チェックすると下の表に反映されます。

          </p>

          <HomeworkTaskManager

            tasks={homework}

            students={studentOptions}

            completions={completions}

          />

        </section>



        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">

          <h2 className="mb-1 text-lg font-bold">申込関連</h2>

          <p className="mb-6 text-sm text-muted">

            出願・申込などの期限付きタスクを登録します。対象の生徒を個別に選択できます。

          </p>

          <ApplicationTaskManager tasks={applications} students={studentOptions} />

        </section>

      </div>

    </AdminPageShell>

  )

}

