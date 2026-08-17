import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { QuizScoreTrendChart } from '@/components/quizzes/QuizScoreTrendChart'
import { StudentQuizScoreHistory } from '@/components/quizzes/StudentQuizScoreHistory'
import { buildQuizScoreTrendData } from '@/lib/quizzes/chart-data'
import { fetchStudentQuizResults } from '@/lib/quizzes/queries'

export default async function StudentQuizzesPage() {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const rows = await fetchStudentQuizResults(profile.id)
  const trendData = buildQuizScoreTrendData(rows)

  return (
    <StudentPageShell title="小テスト" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">得点率の推移</h2>
          <p className="mb-4 text-sm text-muted">実施日ごとの得点率（%）を表示します。</p>
          <QuizScoreTrendChart data={trendData} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">小テストの記録</h2>
          <StudentQuizScoreHistory rows={rows} />
        </section>
      </div>
    </StudentPageShell>
  )
}
