import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { DailyStudyBarChart } from '@/components/study/DailyStudyBarChart'
import { SubjectStudyPieChart } from '@/components/study/SubjectStudyPieChart'
import { StudyLogTable } from '@/components/study/StudyLogTable'
import { TextbookManager } from '@/components/textbooks/TextbookManager'
import {
  buildDailyChartData,
  buildSubjectPieData,
  formatDuration,
} from '@/lib/study/chart-data'
import { getTodayDateKey } from '@/lib/study/dates'
import { AdminStudentTodoTable } from '@/components/todo/AdminTodoTables'
import { buildTodoItems } from '@/lib/todo/build-items'
import {
  fetchApplicationTasksForStudent,
  fetchTodoCompletionsForStudent,
} from '@/lib/todo/queries'
import {
  fetchHomeworkTasksForStudent,
  fetchQuizSchedulesForStudent,
} from '@/lib/schedule/queries'
import { getPersonName } from '@/lib/auth/display-name'
import { AdminStudentQuizSection } from '@/components/quizzes/AdminQuizScoreTable'
import { fetchStudentQuizAssignments } from '@/lib/quizzes/queries'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId, fetchStudentTags, fetchTagIdsForProfile } from '@/lib/tags/queries'
import {
  fetchStudentList,
  fetchStudentProfile,
  fetchStudyLogsForStudent,
  fetchTextbooksForStudent,
} from '@/lib/study/queries'
import { AdminStudentProfileForm } from '@/components/admin/AdminStudentProfileForm'
import { StudentTagAssignForm } from '@/components/tags/StudentTagAssignForm'

export default async function AdminStudentStudyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const student = await fetchStudentProfile(id)

  if (!student || student.role !== 'student') {
    notFound()
  }

  const [logs, textbooks, homework, quizzes, applications, completions, allTags, assignedTagIds, quizAssignments, students, gradeTagByStudentId] =
    await Promise.all([
    fetchStudyLogsForStudent(id),
    fetchTextbooksForStudent(id),
    fetchHomeworkTasksForStudent(id),
    fetchQuizSchedulesForStudent(id),
    fetchApplicationTasksForStudent(id),
    fetchTodoCompletionsForStudent(id),
    fetchStudentTags(),
    fetchTagIdsForProfile(id),
    fetchStudentQuizAssignments(id),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const todoItems = buildTodoItems(homework, quizzes, applications, completions)

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  const { rows, subjects } = buildDailyChartData(logs, 14)
  const pieData = buildSubjectPieData(logs)
  const totalMinutes = logs.reduce((sum, log) => sum + log.duration_minutes, 0)
  const todayKey = getTodayDateKey()
  const todayMinutes = logs
    .filter((log) => log.studied_on === todayKey)
    .reduce((sum, log) => sum + log.duration_minutes, 0)

  const personName = getPersonName(student)
  const profileSubjects = student.subjects ?? []
  const targetSchools = student.target_schools ?? []

  return (
    <AdminPageShell
      title={`${personName} の学習記録`}
      backHref="/admin/students"
      backLabel="生徒一覧"
      wide
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6 lg:sticky lg:top-8">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted">生徒情報</p>
            <h2 className="mt-1 text-xl font-bold">{personName}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted">志望校</dt>
                <dd className="font-medium">
                  {targetSchools.length > 0 ? targetSchools.join(' / ') : '未設定'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">使用科目</dt>
                <dd className="font-medium">
                  {profileSubjects.length > 0 ? profileSubjects.join('・') : '未設定'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm">
              今日: <span className="font-bold">{formatDuration(todayMinutes)}</span>
              {' / '}
              累計: <span className="font-bold">{formatDuration(totalMinutes)}</span>
            </p>
            <AdminStudentProfileForm
              student={{
                id: student.id,
                email: student.email,
                full_name: student.full_name,
                birthday: student.birthday ?? null,
                target_schools: targetSchools,
                subjects: profileSubjects,
                student_code: student.student_code ?? null,
              }}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold">生徒タグ</h2>
            <p className="mb-6 text-sm text-muted">
              学年・系統などのタグを付与します。お知らせの配信先指定に使われます。
            </p>
            <StudentTagAssignForm
              profileId={id}
              allTags={allTags}
              assignedTagIds={assignedTagIds}
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold">小テスト</h2>
            <p className="mb-6 text-sm text-muted">
              この生徒に小テストを登録し、点数を入力できます。
            </p>
            <AdminStudentQuizSection
              studentId={id}
              studentGroups={studentGroups}
              assignments={quizAssignments}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold">宿題・ToDo 状況</h2>
            <p className="mb-6 text-sm text-muted">
              生徒に配信された ToDo（宿題・小テスト・申込関連）の完了・未完了を確認できます。
            </p>
            <AdminStudentTodoTable items={todoItems} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-bold">教材登録</h2>
            <p className="mb-6 text-sm text-muted">
              生徒の使用科目に紐づく教材を登録・管理できます。
            </p>
            <TextbookManager
              studentId={id}
              profileSubjects={profileSubjects}
              textbooks={textbooks}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">日別学習量（直近14日・今日を含む）</h2>
            <DailyStudyBarChart data={rows} subjects={subjects} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">科目別の学習割合</h2>
            <SubjectStudyPieChart data={pieData} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">記録詳細（登録日時付き）</h2>
            <StudyLogTable
              logs={logs}
              profileSubjects={profileSubjects}
              textbooks={textbooks}
            />
          </section>
        </div>
      </div>
    </AdminPageShell>
  )
}
