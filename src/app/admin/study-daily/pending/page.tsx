import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminPendingStudyFeedbackList } from '@/components/study/AdminPendingStudyFeedbackList'
import { Pagination } from '@/components/ui/Pagination'
import { getJstDateKey, isValidDateKey } from '@/lib/study/dates'
import { fetchPendingStudyFeedbackPage } from '@/lib/study/feedback-queries'
import {
  defaultPendingListDateLabel,
  resolvePendingDateFilter,
} from '@/lib/study/pending-feedback'
import { formatPageItemRangeLabel } from '@/lib/pagination'

export const dynamic = 'force-dynamic'

export default async function AdminPendingStudyFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; q?: string; page?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const todayKey = getJstDateKey()
  const dateParam = isValidDateKey(params.date) ? params.date : undefined
  const query = params.q?.trim() ?? ''
  const requestedPage = params.page ? parseInt(params.page, 10) : 1

  if (params.date && !isValidDateKey(params.date)) {
    redirect('/admin/study-daily/pending')
  }

  if (dateParam && dateParam > todayKey) {
    redirect(`/admin/study-daily/pending?date=${todayKey}`)
  }

  const pageResult = await fetchPendingStudyFeedbackPage({
    todayKey,
    date: dateParam,
    query,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    pageSize: 10,
  })

  const dateFilter = resolvePendingDateFilter({ todayKey, date: dateParam })
  const rangeLabel = formatPageItemRangeLabel(
    pageResult.page,
    pageResult.pageSize,
    pageResult.totalCount,
  )

  const scopeLabel =
    dateFilter.mode === 'exact'
      ? dateFilter.date
      : defaultPendingListDateLabel(todayKey)

  return (
    <AdminPageShell
      title="未対応の学習記録"
      backHref="/admin/study-daily"
      backLabel="毎日管理"
    >
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">未対応の学習記録</h2>
        <p className="mt-1 text-sm text-muted">
          スタンプ未返信の学習日を、生徒×学習日のまとまりで表示します。一覧を開いただけでは対応済みになりません。
          初期表示は昨日以前で、ナビ等の「当日の未返信」バッジとは対象日が異なります。日付を指定すると当日分も確認できます。
          学習日の古い順に並べ、1ページ目から順に確認できます。一度スタンプした日は、その後に学習記録が増えても未対応一覧には戻りません。
        </p>

        <form
          method="get"
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-1.5 block text-sm font-medium">学習日</span>
            <input
              type="date"
              name="date"
              defaultValue={dateParam ?? ''}
              max={todayKey}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block min-w-[12rem] flex-1">
            <span className="mb-1.5 block text-sm font-medium">生徒名</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="氏名で検索"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
            >
              絞り込む
            </button>
            {(dateParam || query) && (
              <Link
                href="/admin/study-daily/pending"
                className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-card"
              >
                条件をクリア
              </Link>
            )}
          </div>
        </form>

        <p className="mt-4 text-sm text-muted">
          対象: <span className="font-medium text-foreground">{scopeLabel}</span>
          {query ? (
            <>
              {' '}
              / 検索「<span className="font-medium text-foreground">{query}</span>」
            </>
          ) : null}
          {pageResult.totalCount > 0 ? (
            <>
              {' '}
              · 全 {pageResult.totalCount} 件
              {rangeLabel ? `（${rangeLabel}）` : null}
            </>
          ) : null}
        </p>

        <div className="mt-6">
          <AdminPendingStudyFeedbackList
            items={pageResult.items}
            filterKey={`${dateParam ?? ''}|${query}`}
            dateFilter={dateFilter}
            query={query}
          />
        </div>

        {pageResult.totalCount > 0 && (
          <Pagination
            currentPage={pageResult.page}
            totalCount={pageResult.totalCount}
            pageSize={pageResult.pageSize}
            pageParam="page"
            pathname="/admin/study-daily/pending"
            preserveParams={{
              date: dateParam,
              q: query || undefined,
            }}
          />
        )}
      </section>
    </AdminPageShell>
  )
}
