import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { getPersonName } from '@/lib/auth/display-name'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingKarteForm } from '@/components/coaching/AdminCoachingKarteForm'
import { AdminCoachingKarteQuizForm } from '@/components/coaching/AdminCoachingKarteQuizForm'
import { CoachingKarteMigrationNotice } from '@/components/coaching/CoachingKarteMigrationNotice'
import { DailyStudyBarChart } from '@/components/study/DailyStudyBarChart'
import { fetchCoachingCoaches } from '@/lib/coaching/queries'
import { fetchCoachingKarteEntriesForStudent } from '@/lib/coaching/karte-queries'
import {
  fetchStudentProfile,
  fetchStudyLogsForStudent,
  fetchTextbooksForStudent,
} from '@/lib/study/queries'
import { buildDailyChartData } from '@/lib/study/chart-data'
import { getTodayDateKey } from '@/lib/study/dates'
import { SubjectStudyPieSection } from '@/components/study/SubjectStudyPieSection'

export default async function AdminCoachingKarteStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ booking?: string; coach?: string; historyPage?: string; piePeriod?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const { studentId } = await params
  const query = await searchParams

  const historyPage = query.historyPage ? parseInt(query.historyPage, 10) : 1

  const [student, logs, textbooks, karteResult, coaches] = await Promise.all([
    fetchStudentProfile(studentId),
    fetchStudyLogsForStudent(studentId),
    fetchTextbooksForStudent(studentId),
    fetchCoachingKarteEntriesForStudent(studentId, {
      page: Number.isFinite(historyPage) ? historyPage : 1,
    }),
    fetchCoachingCoaches(true),
  ])

  if (!student || student.role !== 'student') {
    notFound()
  }

  const { rows, subjects } = buildDailyChartData(logs, 14)
  const piePeriod = query.piePeriod === '14' ? '14' : 'all'
  const personName = getPersonName(student)
  const targetSchools = student.target_schools ?? []
  const profileSubjects = student.subjects ?? []

  return (
    <AdminPageShell
      title={`${personName} のカルテ`}
      backHref="/admin/coaching/karte"
      backLabel="生徒を選ぶ"
      extraWide
    >
      <AdminCoachingNav />

      {!karteResult.tableAvailable && <CoachingKarteMigrationNotice />}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium text-muted">生徒情報</p>
            <h2 className="mt-1 text-xl font-bold">{personName}</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted">志望大学・学部学科</dt>
                <dd className="mt-1 font-medium">
                  {targetSchools.length > 0 ? (
                    <ul className="space-y-1">
                      {targetSchools.map((school: string) => (
                        <li key={school}>{school}</li>
                      ))}
                    </ul>
                  ) : (
                    '未設定'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">使用科目</dt>
                <dd className="mt-1 font-medium">
                  {profileSubjects.length > 0 ? profileSubjects.join('・') : '未設定'}
                </dd>
              </div>
            </dl>
          </section>
          <AdminCoachingKarteQuizForm studentId={studentId} />
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold">日別学習量（直近14日）</h2>
            <DailyStudyBarChart data={rows} subjects={subjects} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <SubjectStudyPieSection
              logs={logs}
              initialPeriod={piePeriod}
              compact
              basePath={`/admin/coaching/karte/${studentId}`}
              preserveParams={{
                booking: query.booking,
                coach: query.coach,
                historyPage: query.historyPage,
              }}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">現在登録中の教材</h2>
            {textbooks.length === 0 ? (
              <p className="mt-3 text-sm text-muted">登録されている教材はありません。</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {textbooks.map((book) => {
                  const tags =
                    book.detail_tags && book.detail_tags.length > 0
                      ? book.detail_tags.join('・')
                      : book.subjects.join('・')

                  return (
                    <li key={book.id} className="px-3 py-2.5 text-sm">
                      <p className="font-medium">{book.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{tags}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0">
          <AdminCoachingKarteForm
            studentId={studentId}
            defaultSessionDate={getTodayDateKey()}
            defaultCoachId={query.coach ?? null}
            defaultBookingId={query.booking ?? null}
            coaches={coaches}
            history={karteResult.entries}
            historyTotalCount={karteResult.totalCount ?? 0}
            historyPage={karteResult.page ?? 1}
            historyPageSize={karteResult.pageSize ?? 10}
            tableAvailable={karteResult.tableAvailable}
          />
        </div>
      </div>
    </AdminPageShell>
  )
}
