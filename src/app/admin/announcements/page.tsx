import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminAnnouncementManager } from '@/components/announcements/AdminAnnouncementManager'
import { Pagination } from '@/components/ui/Pagination'
import {
  fetchAllAnnouncementReads,
  fetchAnnouncementsWithTargetsPaginated,
} from '@/lib/announcements/queries'
import { fetchAllProfileTagAssignments, fetchStudentTags } from '@/lib/tags/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ announcementsPage?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const pageNumber = params.announcementsPage ? parseInt(params.announcementsPage, 10) : 1

  const [pageResult, students, reads, allTags, profileTagAssignments] = await Promise.all([
    fetchAnnouncementsWithTargetsPaginated({
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 15,
    }),
    fetchStudentList(),
    fetchAllAnnouncementReads(),
    fetchStudentTags(),
    fetchAllProfileTagAssignments(),
  ])

  return (
    <AdminPageShell title="お知らせ管理" backHref="/admin" backLabel="管理画面">
      <AdminNarrowContent>
        <p className="mb-6 text-sm text-muted">
          お知らせを投稿し、タグまたは個別生徒で配信先を指定できます。既読・未読状況は配信対象者のみ集計されます。
        </p>
        <AdminAnnouncementManager
          announcements={pageResult.announcements}
          students={students}
          reads={reads}
          allTags={allTags}
          profileTagAssignments={profileTagAssignments}
        />
        <Pagination
          currentPage={pageResult.page}
          totalCount={pageResult.totalCount}
          pageSize={pageResult.pageSize}
          pageParam="announcementsPage"
          pathname="/admin/announcements"
        />
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
