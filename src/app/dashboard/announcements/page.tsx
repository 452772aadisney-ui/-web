import { redirect } from 'next/navigation'
import { isUnreadEligibleContent } from '@/lib/account/content-cutoff'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { AnnouncementList } from '@/components/announcements/AnnouncementList'
import { Pagination } from '@/components/ui/Pagination'
import {
  fetchAnnouncementReadsForStudent,
  fetchAnnouncementsPaginated,
} from '@/lib/announcements/queries'
import type { AnnouncementWithReadStatus } from '@/types/announcement'

export const dynamic = 'force-dynamic'

export default async function StudentAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ announcementsPage?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const params = await searchParams
  const pageNumber = params.announcementsPage ? parseInt(params.announcementsPage, 10) : 1

  const [pageResult, reads] = await Promise.all([
    fetchAnnouncementsPaginated({
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 15,
    }),
    fetchAnnouncementReadsForStudent(profile.id),
  ])

  const readMap = new Map(reads.map((r) => [r.announcement_id, r.read_at]))

  const withStatus: AnnouncementWithReadStatus[] = pageResult.announcements.map(
    (announcement) => ({
      ...announcement,
      read:
        readMap.has(announcement.id) ||
        !isUnreadEligibleContent(announcement.created_at, profile.created_at),
      read_at: readMap.get(announcement.id),
    }),
  )

  const unreadCount = withStatus.filter((a) => !a.read).length

  return (
    <StudentPageShell title="お知らせ" backHref="/dashboard" backLabel="マイページ">
      <p className="mb-6 text-sm text-muted">
        未読のお知らせは背景がピンク色です。タップして内容を確認すると既読になります。
        {unreadCount > 0 && (
          <span className="ml-1 font-medium text-pink-800">（このページの未読 {unreadCount} 件）</span>
        )}
      </p>
      {pageResult.totalCount === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          お知らせはまだありません。
        </p>
      ) : (
        <>
          <AnnouncementList announcements={withStatus} />
          <Pagination
            currentPage={pageResult.page}
            totalCount={pageResult.totalCount}
            pageSize={pageResult.pageSize}
            pageParam="announcementsPage"
            pathname="/dashboard/announcements"
          />
        </>
      )}
    </StudentPageShell>
  )
}
