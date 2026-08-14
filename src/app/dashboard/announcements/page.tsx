import { redirect } from 'next/navigation'
import { isUnreadEligibleContent } from '@/lib/account/content-cutoff'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { AnnouncementList } from '@/components/announcements/AnnouncementList'
import {
  fetchAnnouncementReadsForStudent,
  fetchAnnouncementsForStudent,
} from '@/lib/announcements/queries'
import type { AnnouncementWithReadStatus } from '@/types/announcement'

export const dynamic = 'force-dynamic'

export default async function StudentAnnouncementsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const [announcements, reads] = await Promise.all([
    fetchAnnouncementsForStudent(profile.id),
    fetchAnnouncementReadsForStudent(profile.id),
  ])

  const readMap = new Map(reads.map((r) => [r.announcement_id, r.read_at]))

  const withStatus: AnnouncementWithReadStatus[] = announcements.map((announcement) => ({
    ...announcement,
    read:
      readMap.has(announcement.id) ||
      !isUnreadEligibleContent(announcement.created_at, profile.created_at),
    read_at: readMap.get(announcement.id),
  }))

  const unreadCount = withStatus.filter((a) => !a.read).length

  return (
    <StudentPageShell title="お知らせ" backHref="/dashboard" backLabel="マイページ">
      <p className="mb-6 text-sm text-muted">
        未読のお知らせは背景がピンク色です。タップして内容を確認すると既読になります。
        {unreadCount > 0 && (
          <span className="ml-1 font-medium text-pink-800">（未読 {unreadCount} 件）</span>
        )}
      </p>
      <AnnouncementList announcements={withStatus} />
    </StudentPageShell>
  )
}
