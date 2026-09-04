import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { DailyStudyBarChart } from '@/components/study/DailyStudyBarChart'
import { SubjectStudyPieSection } from '@/components/study/SubjectStudyPieSection'
import { StudyLogDayNav } from '@/components/study/StudyLogDayNav'
import { StudyLogTable } from '@/components/study/StudyLogTable'
import { StudyDayFeedbackCard } from '@/components/study/StudyDayFeedbackCard'
import { StudyFeedbackReadMarker } from '@/components/study/StudyFeedbackReadMarker'
import {
  buildDailyChartData,
  buildSubjectPieDataFromMinutes,
  formatDuration,
} from '@/lib/study/chart-data'
import {
  getJstDateKey,
  getRecentDateKeys,
  getTodayDateKey,
  isValidDateKey,
} from '@/lib/study/dates'
import {
  fetchStudyDayFeedback,
  fetchUnreadStudyFeedbackDates,
} from '@/lib/study/feedback-queries'
import {
  fetchStudyLogsForStudentInDateRange,
  fetchStudyLogsForStudentOnDate,
  fetchStudySubjectMinutesForStudent,
  fetchTextbooksForStudent,
} from '@/lib/study/queries'

export default async function StudentStudyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; piePeriod?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const params = await searchParams
  const todayKey = getJstDateKey()
  const selectedDate = isValidDateKey(params.date) ? params.date : todayKey

  if (selectedDate > todayKey) {
    redirect(`/dashboard/study/history?date=${todayKey}`)
  }

  const recentKeys = getRecentDateKeys(14)
  const rangeFrom = recentKeys[0]!
  const rangeTo = recentKeys[recentKeys.length - 1]!

  const [dayLogs, rangeLogs, minutesAll, minutes14, textbooks, feedback, unreadFeedbackDates] =
    await Promise.all([
      fetchStudyLogsForStudentOnDate(profile.id, selectedDate),
      fetchStudyLogsForStudentInDateRange(profile.id, rangeFrom, rangeTo),
      fetchStudySubjectMinutesForStudent(profile.id),
      fetchStudySubjectMinutesForStudent(profile.id, {
        fromDate: rangeFrom,
        toDate: rangeTo,
      }),
      fetchTextbooksForStudent(profile.id),
      fetchStudyDayFeedback(profile.id, selectedDate),
      fetchUnreadStudyFeedbackDates(profile.id),
    ])

  const hasUnreadFeedbackOnSelected =
    unreadFeedbackDates.has(selectedDate) && Boolean(feedback?.comment.trim())

  const dayMinutes = dayLogs.reduce((sum, log) => sum + log.duration_minutes, 0)
  const { rows, subjects } = buildDailyChartData(rangeLogs, 14)
  const pieDataAll = buildSubjectPieDataFromMinutes(minutesAll)
  const pieData14 = buildSubjectPieDataFromMinutes(minutes14)
  const totalMinutes = minutesAll.reduce((sum, row) => sum + row.minutes, 0)
  const chartTodayKey = getTodayDateKey()
  const todayMinutes = rangeLogs
    .filter((log) => log.studied_on === chartTodayKey)
    .reduce((sum, log) => sum + log.duration_minutes, 0)
  const profileSubjects = profile.subjects ?? []
  const piePeriod = params.piePeriod === '14' ? '14' : 'all'

  return (
    <StudentPageShell title="学習履歴" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold">記録一覧</h2>
          <StudyLogDayNav
            selectedDate={selectedDate}
            dayTotalMinutes={dayMinutes}
            basePath="/dashboard/study/history"
            unreadFeedbackDates={[...unreadFeedbackDates]}
          />
          <StudyLogTable
            logs={dayLogs}
            profileSubjects={profileSubjects}
            textbooks={textbooks}
            editable
            variant="compact"
            hideStudiedOnColumn
            emptyMessage="この日の学習記録はありません。"
          />
          {feedback && (
            <>
              {feedback.comment.trim() && (
                <StudyFeedbackReadMarker feedbackId={feedback.id} />
              )}
              <StudyDayFeedbackCard
                feedback={feedback}
                className="mt-4"
                isUnread={hasUnreadFeedbackOnSelected}
              />
            </>
          )}
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
          <SubjectStudyPieSection
            data14={pieData14}
            dataAll={pieDataAll}
            initialPeriod={piePeriod}
          />
        </section>

        <p className="text-sm text-muted">
          新しい記録は{' '}
          <Link href="/dashboard/study" className="text-primary hover:underline">
            学習を記録する
          </Link>
          から追加できます。教材の追加は{' '}
          <Link href="/dashboard/textbooks/register?mode=create" className="text-primary hover:underline">
            教材登録
          </Link>
          から行えます。
        </p>
      </div>
    </StudentPageShell>
  )
}
