import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar'
import { buildCalendarEvents, buildCoachingCalendarEvents, buildQuizAssignmentCalendarEvents } from '@/lib/calendar/build-events'
import { fetchCoachingBookingsForStudent } from '@/lib/coaching/queries'
import { fetchStudentQuizAssignments } from '@/lib/quizzes/queries'
import {
  fetchExamSchedulesForStudent,
  fetchHomeworkTasksForStudent,
} from '@/lib/schedule/queries'
import { fetchTextbooksForStudent } from '@/lib/study/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNameForProfile } from '@/lib/tags/queries'

export default async function StudentCalendarPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const gradeTagName = await fetchGradeTagNameForProfile(profile.id)
  const isKisotsuStudent = isKisotsuGradeTag(gradeTagName)

  const [exams, homework, textbooks, coachingBookings, quizAssignments] = await Promise.all([
    fetchExamSchedulesForStudent(profile.id),
    fetchHomeworkTasksForStudent(profile.id),
    fetchTextbooksForStudent(profile.id),
    isKisotsuStudent ? Promise.resolve([]) : fetchCoachingBookingsForStudent(profile.id),
    fetchStudentQuizAssignments(profile.id),
  ])

  const events = [
    ...buildCalendarEvents(exams, homework, textbooks),
    ...buildQuizAssignmentCalendarEvents(quizAssignments),
    ...(isKisotsuStudent ? [] : buildCoachingCalendarEvents(coachingBookings)),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <StudentPageShell title="カレンダー" backHref="/dashboard" backLabel="マイページ">
      <p className="mb-6 text-sm text-muted">
        {isKisotsuStudent
          ? '模試・小テスト、宿題・タスク、参考書を一覧できます。'
          : '模試・小テスト、宿題・タスク、参考書、コーチング予約を一覧できます。'}
      </p>
      <ScheduleCalendar events={events} />
    </StudentPageShell>
  )
}
