import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminAnnouncementManager } from '@/components/announcements/AdminAnnouncementManager'
import {
  fetchAllAnnouncementReads,
  fetchAnnouncements,
} from '@/lib/announcements/queries'
import { fetchAllProfileTagAssignments, fetchStudentTags } from '@/lib/tags/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminAnnouncementsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [announcements, students, reads, allTags, profileTagAssignments] = await Promise.all([
    fetchAnnouncements(),
    fetchStudentList(),
    fetchAllAnnouncementReads(),
    fetchStudentTags(),
    fetchAllProfileTagAssignments(),
  ])

  return (
    <AdminPageShell title="お知らせ管理" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        お知らせを投稿し、タグまたは個別生徒で配信先を指定できます。既読・未読状況は配信対象者のみ集計されます。
      </p>
      <AdminAnnouncementManager
        announcements={announcements}
        students={students}
        reads={reads}
        allTags={allTags}
        profileTagAssignments={profileTagAssignments}
      />
    </AdminPageShell>
  )
}
