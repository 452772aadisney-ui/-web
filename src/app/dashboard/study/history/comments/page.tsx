import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyFeedbackCommentsList } from '@/components/study/StudyFeedbackCommentsList'
import { Pagination } from '@/components/ui/Pagination'
import { fetchStudyFeedbackCommentsPage } from '@/lib/study/feedback-queries'

export const dynamic = 'force-dynamic'

export default async function StudyFeedbackCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect('/dashboard')

  const params = await searchParams
  const filter = params.filter === 'all' ? 'all' : 'unread'
  const requestedPage = params.page ? parseInt(params.page, 10) : 1

  const pageResult = await fetchStudyFeedbackCommentsPage({
    studentId: profile.id,
    filter,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    pageSize: 15,
  })

  const emptyMessage =
    filter === 'unread'
      ? '未読のコメントはありません。'
      : '先生からのコメントはまだありません。'

  return (
    <StudentPageShell
      title="新着コメント一覧"
      backHref="/dashboard/study/history"
      backLabel="学習履歴"
    >
      <p className="mb-4 text-sm text-muted">
        自分の学習記録に届いたコメントです。一覧の取得だけでは既読になりません。
        {pageResult.unreadCount > 0 && (
          <span className="ml-1 font-medium text-pink-800">
            （未読 {pageResult.unreadCount} 件）
          </span>
        )}
      </p>

      <StudyFeedbackCommentsList
        items={pageResult.items}
        filter={pageResult.filter}
        unreadCount={pageResult.unreadCount}
        emptyMessage={emptyMessage}
      />

      {pageResult.totalCount > 0 && (
        <Pagination
          currentPage={pageResult.page}
          totalCount={pageResult.totalCount}
          pageSize={pageResult.pageSize}
          pageParam="page"
          pathname="/dashboard/study/history/comments"
          preserveParams={{ filter: pageResult.filter }}
        />
      )}

      <p className="mt-6 text-sm text-muted">
        <Link href="/dashboard/study/history" className="text-primary hover:underline">
          学習履歴に戻る
        </Link>
      </p>
    </StudentPageShell>
  )
}
