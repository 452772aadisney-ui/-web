import Link from 'next/link'
import { requireAdminOrRedirect } from '@/lib/class-schedule/access'
import {
  fetchClassScheduleDaysPaginated,
} from '@/lib/class-schedule/queries'
import { getJstDateKey } from '@/lib/study/dates'
import { parsePageParam } from '@/lib/pagination'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminClassScheduleDayList } from '@/components/class-schedule/AdminClassScheduleDayList'
import { Pagination } from '@/components/ui/Pagination'

export const dynamic = 'force-dynamic'

/** Soft budget for class-schedule notification fan-out after mutations. */
export const maxDuration = 60

export default async function AdminClassSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ upcomingPage?: string; pastPage?: string }>
}) {
  await requireAdminOrRedirect()
  const params = await searchParams
  const todayKey = getJstDateKey()

  const upcomingPageRaw = params.upcomingPage ? parseInt(params.upcomingPage, 10) : 1
  const pastPageRaw = params.pastPage ? parseInt(params.pastPage, 10) : 1

  const [upcoming, past] = await Promise.all([
    fetchClassScheduleDaysPaginated({
      scope: 'upcoming',
      page: Number.isFinite(upcomingPageRaw) ? upcomingPageRaw : 1,
      pageSize: 10,
      todayKey,
    }),
    fetchClassScheduleDaysPaginated({
      scope: 'past',
      page: Number.isFinite(pastPageRaw) ? pastPageRaw : 1,
      pageSize: 10,
      todayKey,
    }),
  ])

  const upcomingPage = parsePageParam(String(upcoming.page), upcoming.totalPages)
  const pastPage = parsePageParam(String(past.page), past.totalPages)

  return (
    <AdminPageShell title="既卒生 授業予定" backHref="/admin" backLabel="管理画面">
      <AdminNarrowContent>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            既卒生向けの授業日・コマを登録・管理します。
          </p>
          <Link
            href="/admin/class-schedule/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            新規登録
          </Link>
        </div>

        <section className="mb-10 space-y-4">
          <h2 className="text-lg font-bold">今後の予定</h2>
          <AdminClassScheduleDayList
            days={upcoming.days}
            emptyMessage="今後の授業予定はありません。"
          />
          <Pagination
            currentPage={upcomingPage}
            totalCount={upcoming.totalCount}
            pageSize={upcoming.pageSize}
            pageParam="upcomingPage"
            pathname="/admin/class-schedule"
            preserveParams={{ pastPage: pastPage > 1 ? String(pastPage) : undefined }}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold">過去の予定</h2>
          <AdminClassScheduleDayList
            days={past.days}
            emptyMessage="過去の授業予定はありません。"
          />
          <Pagination
            currentPage={pastPage}
            totalCount={past.totalCount}
            pageSize={past.pageSize}
            pageParam="pastPage"
            pathname="/admin/class-schedule"
            preserveParams={{
              upcomingPage: upcomingPage > 1 ? String(upcomingPage) : undefined,
            }}
          />
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
