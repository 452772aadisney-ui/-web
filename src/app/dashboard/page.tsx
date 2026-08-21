import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { CoachingAlertBanner } from '@/components/coaching/CoachingAlertBanner'
import { MyPageActions } from '@/components/student/MyPageActions'
import { StudentQrCode } from '@/components/student/StudentQrCode'
import { fetchStudentStarRanking } from '@/lib/achievements/ranking'
import { fetchUnreadAnnouncementCount } from '@/lib/announcements/queries'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { fetchCurrentStudyStreakForStudent } from '@/lib/study/queries'
import { fetchUnreadStudyFeedbackCount } from '@/lib/study/feedback-queries'
import { fetchUnseenTextbookCount } from '@/lib/textbooks/catalog-queries'
import { getCoachingAlertState, getNextCoachingBooking } from '@/lib/coaching/alert'
import { fetchCoachingBookingsForStudent } from '@/lib/coaching/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNameForProfile } from '@/lib/tags/queries'

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

  const [unreadAnnouncementCount, unreadChatCount, unreadStudyFeedbackCount, unseenTextbookCount, studyStreakDays, starRanking] =
    profile.role === 'student'
      ? await Promise.all([
          fetchUnreadAnnouncementCount(profile.id).catch(() => 0),
          fetchUnreadChatCount(profile.id).catch(() => 0),
          fetchUnreadStudyFeedbackCount(profile.id).catch(() => 0),
          fetchUnseenTextbookCount(profile.id).catch(() => 0),
          fetchCurrentStudyStreakForStudent(profile.id).catch(() => 0),
          fetchStudentStarRanking(profile.id).catch(() => null),
        ])
      : [0, 0, 0, 0, 0, null]

  const gradeTagName =
    profile.role === 'student' ? await fetchGradeTagNameForProfile(profile.id) : null
  const isKisotsuStudent = isKisotsuGradeTag(gradeTagName)
  const showFaqIntro =
    profile.role === 'student' && profile.faq_intro_seen_at == null

  return (
    <StudentPageShell title="マイページ">
      <div className="space-y-6">
        {coachingAlert?.showAlert && <CoachingAlertBanner message={coachingAlert.message} />}

        <MyPageActions
          starRanking={starRanking}
          nextCoaching={nextCoaching}
          studyStreakDays={studyStreakDays}
          unreadStudyFeedbackCount={unreadStudyFeedbackCount}
          unreadAnnouncementCount={unreadAnnouncementCount}
          unreadChatCount={unreadChatCount}
          unseenTextbookCount={unseenTextbookCount}
          hideClassSchedule={isKisotsuStudent}
          showFaqIntro={showFaqIntro}
        />

        {profile.role === 'student' && profile.student_code && !isKisotsuStudent && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">生徒ID（QRコード）</h2>
            <StudentQrCode studentCode={profile.student_code} />
          </section>
        )}
      </div>
    </StudentPageShell>
  )
}
