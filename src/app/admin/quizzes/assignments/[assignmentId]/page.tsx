import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminQuizAssignmentScoreTable } from '@/components/quizzes/AdminQuizScoreTable'
import { fetchQuizAssignmentDetail } from '@/lib/quizzes/queries'

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

export default async function AdminQuizAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const detail = await fetchQuizAssignmentDetail(assignmentId)
  if (!detail) notFound()

  return (
    <AdminPageShell title="小テスト点数入力" backHref="/admin/quizzes" backLabel="小テスト">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{detail.master.title}</h2>
            <p className="mt-1 text-sm text-muted">
              実施日: {formatDate(detail.assignment.scheduled_on)}
              {detail.master.subject ? ` / ${detail.master.subject}` : ''}
              {` / 満点 ${detail.master.max_score}`}
            </p>
            {detail.assignment.note && (
              <p className="mt-2 text-sm text-muted">メモ: {detail.assignment.note}</p>
            )}
          </div>
          <Link href="/admin/quizzes" className="text-sm text-primary hover:underline">
            一覧へ戻る
          </Link>
        </div>
        <AdminQuizAssignmentScoreTable detail={detail} />
      </section>
    </AdminPageShell>
  )
}
