import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudyDailyDateNav } from '@/components/study/AdminStudyDailyDateNav'
import { AdminStudentDailyStudyCard } from '@/components/study/AdminStudentDailyStudyCard'
import { getJstDateKey, isValidDateKey } from '@/lib/study/dates'
import { fetchStudentDailyStudySummaries } from '@/lib/study/feedback-queries'

export default async function AdminStudyDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const params = await searchParams
  const todayKey = getJstDateKey()
  const selectedDate = isValidDateKey(params.date) ? params.date : todayKey

  if (selectedDate > todayKey) {
    redirect(`/admin/study-daily?date=${todayKey}`)
  }

  const summaries = await fetchStudentDailyStudySummaries(selectedDate)
  const sortedSummaries = [...summaries].sort((a, b) => {
    const aComplete = a.feedback ? 1 : 0
    const bComplete = b.feedback ? 1 : 0
    return aComplete - bComplete
  })

  return (
    <AdminPageShell title="毎日管理" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">学習記録の確認とフィードバック</h2>
        <p className="mt-1 text-sm text-muted">
          選択した日に学習記録が登録された生徒を表示します。スタンプとコメントを送ると、生徒の学習履歴に表示され、メールでも通知されます。
        </p>

        <AdminStudyDailyDateNav selectedDate={selectedDate} />

        {sortedSummaries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            この日の学習記録はまだありません。
          </p>
        ) : (
          <div className="space-y-6">
            {sortedSummaries.map((summary) => (
              <AdminStudentDailyStudyCard
                key={summary.student.id}
                summary={summary}
                studiedOn={selectedDate}
              />
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  )
}
