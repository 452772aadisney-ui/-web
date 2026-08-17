import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminQuizManager } from '@/components/quizzes/AdminQuizManager'
import { fetchQuizAssignments, fetchQuizMasters } from '@/lib/quizzes/queries'

export default async function AdminQuizzesPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [masters, assignments] = await Promise.all([
    fetchQuizMasters(),
    fetchQuizAssignments(),
  ])

  return (
    <AdminPageShell title="小テスト" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">小テスト管理</h2>
        <p className="mb-6 text-sm text-muted">
          小テストの種類を登録します。生徒への割り当ては生徒一覧から行い、点数は生徒詳細または実施記録から入力できます。
        </p>
        <AdminQuizManager masters={masters} assignments={assignments} />
      </section>
    </AdminPageShell>
  )
}
