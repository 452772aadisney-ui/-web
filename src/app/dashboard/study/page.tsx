import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyLogForm } from '@/components/study/StudyLogForm'
import { DailyStudyBarChart } from '@/components/study/DailyStudyBarChart'
import { SubjectStudyPieChart } from '@/components/study/SubjectStudyPieChart'
import { StudyLogDayNav } from '@/components/study/StudyLogDayNav'
import { StudyLogTable } from '@/components/study/StudyLogTable'
import {
  buildDailyChartData,
  buildSubjectPieData,
  formatDuration,
} from '@/lib/study/chart-data'
import { getJstDateKey, getTodayDateKey, isValidDateKey } from '@/lib/study/dates'
import { fetchStudyLogsForStudent, fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function StudentStudyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const params = await searchParams
  const todayKey = getJstDateKey()
  const selectedDate = isValidDateKey(params.date) ? params.date : todayKey

  if (selectedDate > todayKey) {
    redirect(`/dashboard/study?date=${todayKey}`)
  }

  const [logs, textbooks] = await Promise.all([
    fetchStudyLogsForStudent(profile.id),
    fetchTextbooksForStudent(profile.id),
  ])

  const dayLogs = logs.filter((log) => log.studied_on === selectedDate)
  const dayMinutes = dayLogs.reduce((sum, log) => sum + log.duration_minutes, 0)

  const { rows, subjects } = buildDailyChartData(logs, 14)
  const pieData = buildSubjectPieData(logs)
  const totalMinutes = logs.reduce((sum, log) => sum + log.duration_minutes, 0)
  const chartTodayKey = getTodayDateKey()
  const todayMinutes = logs
    .filter((log) => log.studied_on === chartTodayKey)
    .reduce((sum, log) => sum + log.duration_minutes, 0)
  const profileSubjects = profile.subjects ?? []

  return (
    <StudentPageShell title="学習記録" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">学習を記録する</h2>
          <p className="mt-1 text-sm text-muted">
            プロフィールの使用科目と登録済み教材から選んで記録します。
          </p>
          <div className="mt-6">
            <StudyLogForm profileSubjects={profileSubjects} textbooks={textbooks} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">日別学習量（直近14日）</h2>
              <p className="mt-1 text-sm text-muted">科目ごとに積み上げ表示（今日を含む）</p>
            </div>
            <div className="text-right text-sm text-muted">
              <p>
                今日:{' '}
                <span className="font-bold text-foreground">{formatDuration(todayMinutes)}</span>
              </p>
              <p>
                累計:{' '}
                <span className="font-bold text-foreground">{formatDuration(totalMinutes)}</span>
              </p>
            </div>
          </div>
          <DailyStudyBarChart data={rows} subjects={subjects} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">科目別の学習割合</h2>
          <SubjectStudyPieChart data={pieData} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold">記録一覧</h2>
          <StudyLogDayNav selectedDate={selectedDate} dayTotalMinutes={dayMinutes} />
          <StudyLogTable
            logs={dayLogs}
            profileSubjects={profileSubjects}
            textbooks={textbooks}
            editable
            hideStudiedOnColumn
            emptyMessage="この日の学習記録はありません。"
          />
        </section>

        <p className="text-sm text-muted">
          教材の追加は{' '}
          <Link href="/dashboard/bookshelf" className="text-primary hover:underline">
            本棚
          </Link>
          から行えます。
        </p>
      </div>
    </StudentPageShell>
  )
}
