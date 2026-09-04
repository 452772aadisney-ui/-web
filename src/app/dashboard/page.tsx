import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { MyPageActions } from '@/components/student/MyPageActions'
import { StudentQrCode } from '@/components/student/StudentQrCode'
import { fetchStudentStarRanking } from '@/lib/achievements/ranking'
import { fetchUnreadAnnouncementCount } from '@/lib/announcements/queries'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { fetchCurrentStudyStreakForStudent } from '@/lib/study/queries'
import { fetchUnreadStudyFeedbackCount } from '@/lib/study/feedback-queries'
import { fetchUnseenTextbookCount } from '@/lib/textbooks/catalog-queries'
import { fetchIncompleteTodoCount, fetchOverdueTodoCount } from '@/lib/todo/queries'
import { fetchPendingStudentQuizCount } from '@/lib/quizzes/queries'
import { getCoachingAlertState, getNextCoachingBooking } from '@/lib/coaching/alert'
import { fetchCoachingBookingsForStudent } from '@/lib/coaching/queries'
import { getDaysUntilCommonTest } from '@/lib/exam/common-test-countdown'
import { getJstDateKey } from '@/lib/study/dates'
import { isKisotsuGradeTag, showsCommonTestCountdown } from '@/lib/tags/grade-order'
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
      <StudentPageShell title="マイページ" mainClassName="pt-3 pb-8">
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

  const gradeTagName =
    profile.role === 'student' ? await fetchGradeTagNameForProfile(profile.id) : null
  const isKisotsuStudent = isKisotsuGradeTag(gradeTagName)

  const coachingBookings =
    profile.role === 'student' && !isKisotsuStudent
      ? await fetchCoachingBookingsForStudent(profile.id)
      : []

  const coachingAlert =
    profile.role === 'student' && !isKisotsuStudent
      ? getCoachingAlertState(coachingBookings)
      : null
  const nextCoaching =
    profile.role === 'student' && !isKisotsuStudent
      ? getNextCoachingBooking(coachingBookings)
      : null

  const [unreadAnnouncementCount, unreadChatCount, unreadStudyFeedbackCount, unseenTextbookCount, incompleteTodoCount, overdueTodoCount, pendingQuizCount, studyStreakDays, starRanking] =
    profile.role === 'student'
      ? await Promise.all([
          fetchUnreadAnnouncementCount(profile.id).catch(() => 0),
          fetchUnreadChatCount(profile.id).catch(() => 0),
          fetchUnreadStudyFeedbackCount(profile.id).catch(() => 0),
          fetchUnseenTextbookCount(profile.id).catch(() => 0),
          fetchIncompleteTodoCount(profile.id).catch(() => 0),
          fetchOverdueTodoCount(profile.id).catch(() => 0),
          fetchPendingStudentQuizCount(profile.id).catch(() => 0),
          fetchCurrentStudyStreakForStudent(profile.id).catch(() => 0),
          fetchStudentStarRanking(profile.id).catch(() => null),
        ])
      : [0, 0, 0, 0, 0, 0, 0, 0, null]

  const showFaqIntro =
    profile.role === 'student' && profile.faq_intro_seen_at == null
  const commonTestDaysRemaining = showsCommonTestCountdown(gradeTagName)
    ? getDaysUntilCommonTest(getJstDateKey())
    : null

  return (
    <StudentPageShell title="マイページ" mainClassName="pt-3 pb-8">
      <div className="space-y-6">
        <MyPageActions
          starRanking={starRanking}
          nextCoaching={nextCoaching}
          coachingAlertMessage={
            coachingAlert?.showAlert ? coachingAlert.message : null
          }
          commonTestDaysRemaining={commonTestDaysRemaining}
          studyStreakDays={studyStreakDays}
          unreadStudyFeedbackCount={unreadStudyFeedbackCount}
          unreadAnnouncementCount={unreadAnnouncementCount}
          unreadChatCount={unreadChatCount}
          unseenTextbookCount={unseenTextbookCount}
          incompleteTodoCount={incompleteTodoCount}
          overdueTodoCount={overdueTodoCount}
          pendingQuizCount={pendingQuizCount}
          hideClassSchedule={isKisotsuStudent}
          hideCoaching={isKisotsuStudent}
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
