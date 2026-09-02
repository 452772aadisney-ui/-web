import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingBookingReminderPanel } from '@/components/chat/AdminCoachingBookingReminderPanel'
import { ChatThreadList } from '@/components/chat/ChatThreadList'
import { fetchAdminChatThreads } from '@/lib/chat/thread-list'
import { fetchStudentsWithoutCoachingBookingThisWeek } from '@/lib/coaching/queries'
import { formatWeekRange, getWeekStartMonday } from '@/lib/coaching/week'

const COACHING_BOOKING_REMINDER_MESSAGE =
  '今週のコーチング予約が入っていません。マイページの「コーチング予約」から，早急に予約してください。今週が難しい場合は，必ず担当者に個別で相談してください。'

export default async function AdminChatListPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const weekLabel = formatWeekRange(getWeekStartMonday())
  const [threads, unbookedStudents] = await Promise.all([
    fetchAdminChatThreads(profile.id),
    fetchStudentsWithoutCoachingBookingThisWeek(),
  ])

  return (
    <AdminPageShell title="メッセージ" backHref="/admin" backLabel="管理画面">
      <AdminCoachingBookingReminderPanel
        weekLabel={weekLabel}
        targetCount={unbookedStudents.length}
        defaultMessage={COACHING_BOOKING_REMINDER_MESSAGE}
      />
      <p className="mb-4 text-sm text-muted">
        生徒名をタップしてトークを開けます。未読がある場合は名前の横にバッジが表示されます。
      </p>
      <ChatThreadList
        threads={threads}
        hrefForThread={(studentId) => `/admin/chat/${studentId}`}
        emptyMessage="登録されている生徒がいません。"
      />
    </AdminPageShell>
  )
}
