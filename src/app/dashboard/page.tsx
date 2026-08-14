import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { CoachingAlertBanner } from '@/components/coaching/CoachingAlertBanner'
import { MyPageActions } from '@/components/student/MyPageActions'
import { MyPageAlertBanner } from '@/components/student/MyPageAlertBanner'
import { StudentQrCode } from '@/components/student/StudentQrCode'
import { fetchUnreadAnnouncementCount } from '@/lib/announcements/queries'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { fetchUnreadStudyFeedbackCount } from '@/lib/study/feedback-queries'
import { getCoachingAlertState, getNextCoachingBooking } from '@/lib/coaching/alert'
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

  const coachingBookings =
    profile.role === 'student' ? await fetchCoachingBookingsForStudent(profile.id) : []

  const coachingAlert =
    profile.role === 'student' ? getCoachingAlertState(coachingBookings) : null
  const nextCoaching =
    profile.role === 'student' ? getNextCoachingBooking(coachingBookings) : null

  const [unreadAnnouncementCount, unreadChatCount, unreadStudyFeedbackCount] =
    profile.role === 'student'
      ? await Promise.all([
          fetchUnreadAnnouncementCount(profile.id).catch(() => 0),
          fetchUnreadChatCount(profile.id).catch(() => 0),
          fetchUnreadStudyFeedbackCount(profile.id).catch(() => 0),
        ])
      : [0, 0, 0]

  return (
    <StudentPageShell title="マイページ">
      <div className="space-y-6">
        {coachingAlert?.showAlert && <CoachingAlertBanner message={coachingAlert.message} />}

        {unreadAnnouncementCount > 0 && (
          <MyPageAlertBanner
            title="未読のお知らせがあります"
            href="/dashboard/announcements"
            actionLabel="お知らせを見る"
          />
        )}

        {unreadChatCount > 0 && (
          <MyPageAlertBanner
            title="未読のメッセージがあります"
            href="/dashboard/chat"
            actionLabel="メッセージを見る"
          />
        )}

        {unreadStudyFeedbackCount > 0 && (
          <MyPageAlertBanner
            title="学習記録にコメントが届いています"
            href="/dashboard/study/history"
            actionLabel="学習履歴を見る"
          />
        )}

        <MyPageActions
          nextCoaching={nextCoaching}
          unreadStudyFeedbackCount={unreadStudyFeedbackCount}
          unreadChatCount={unreadChatCount}
        />

        {profile.role === 'student' && profile.student_code && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">生徒ID（QRコード）</h2>
            <StudentQrCode studentCode={profile.student_code} />
          </section>
        )}
      </div>
    </StudentPageShell>
  )
}
