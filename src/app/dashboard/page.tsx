import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { CoachingAlertBanner } from '@/components/coaching/CoachingAlertBanner'
import { MyPageActions } from '@/components/student/MyPageActions'
import { MyPageAlertBanner } from '@/components/student/MyPageAlertBanner'
import { fetchUnreadAnnouncementCount } from '@/lib/announcements/queries'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { getCoachingAlertState } from '@/lib/coaching/alert'
import { fetchCoachingBookingsForStudent } from '@/lib/coaching/queries'

export default async function StudentDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { profile, error } = await getCurrentProfileWithError()

  if (!profile) {
    return (
      <StudentPageShell title="マイページ">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-bold text-red-800">プロフィールを読み込めません</h2>
          <p className="mt-2 text-sm text-red-700">
            Supabase の SQL Editor で{' '}
            <code className="rounded bg-red-100 px-1">004_fix_rls_recursion.sql</code>{' '}
            を実行してから、ページを再読み込みしてください。
          </p>
          {error && (
            <p className="mt-3 rounded bg-red-100 px-3 py-2 font-mono text-xs text-red-800">
              詳細: {error}
            </p>
          )}
        </section>
      </StudentPageShell>
    )
  }

  const [coachingAlert, unreadAnnouncementCount, unreadChatCount] =
    profile.role === 'student'
      ? await Promise.all([
          getCoachingAlertState(await fetchCoachingBookingsForStudent(profile.id)),
          fetchUnreadAnnouncementCount(profile.id).catch(() => 0),
          fetchUnreadChatCount(profile.id).catch(() => 0),
        ])
      : [null, 0, 0]

  return (
    <StudentPageShell title="マイページ">
      <div className="space-y-6">
        {coachingAlert?.showAlert && <CoachingAlertBanner message={coachingAlert.message} />}

        {unreadAnnouncementCount > 0 && (
          <MyPageAlertBanner
            title="未読のお知らせがあります"
            message={`未読のお知らせが${unreadAnnouncementCount}件あります。内容を確認してください。`}
            href="/dashboard/announcements"
            actionLabel="お知らせを見る"
          />
        )}

        {unreadChatCount > 0 && (
          <MyPageAlertBanner
            title="未読のメッセージがあります"
            message={`未読のメッセージが${unreadChatCount}件あります。返信を確認してください。`}
            href="/dashboard/chat"
            actionLabel="メッセージを見る"
          />
        )}

        <MyPageActions />
      </div>
    </StudentPageShell>
  )
}
