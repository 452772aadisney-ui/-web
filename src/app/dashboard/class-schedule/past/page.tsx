import Link from 'next/link'
import { requireKisotsuStudentOrRedirect } from '@/lib/class-schedule/access'
import { fetchClassScheduleDaysPaginated } from '@/lib/class-schedule/queries'
import { getJstDateKey } from '@/lib/study/dates'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentClassScheduleDayCards } from '@/components/class-schedule/StudentClassScheduleViews'
import { Pagination } from '@/components/ui/Pagination'

export const dynamic = 'force-dynamic'

export default async function StudentClassSchedulePastPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await requireKisotsuStudentOrRedirect()
  const params = await searchParams
  const pageNumber = params.page ? parseInt(params.page, 10) : 1
  const todayKey = getJstDateKey()

  const result = await fetchClassScheduleDaysPaginated({
    scope: 'past',
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    pageSize: 10,
    todayKey,
  })

  return (
    <StudentPageShell
      title="過去の授業予定"
      backHref="/dashboard/class-schedule"
      backLabel="授業予定"
    >
      <div className="space-y-6">
        <StudentClassScheduleDayCards
          days={result.days}
          emptyMessage="過去の授業予定はありません。"
        />
        <Pagination
          currentPage={result.page}
          totalCount={result.totalCount}
          pageSize={result.pageSize}
          pageParam="page"
          pathname="/dashboard/class-schedule/past"
        />
        <p className="text-center">
          <Link
            href="/dashboard/class-schedule"
            className="text-sm font-medium text-primary hover:underline"
          >
            今後の予定に戻る
          </Link>
        </p>
      </div>
    </StudentPageShell>
  )
}
