import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar'
import { buildCalendarEvents } from '@/lib/calendar/build-events'
import {
  fetchExamSchedulesForStudent,
  fetchHomeworkTasksForStudent,
} from '@/lib/schedule/queries'
import { fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function StudentCalendarPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const [exams, homework, textbooks] = await Promise.all([
    fetchExamSchedulesForStudent(profile.id),
    fetchHomeworkTasksForStudent(profile.id),
    fetchTextbooksForStudent(profile.id),
  ])

  const events = buildCalendarEvents(exams, homework, textbooks)

  return (
    <StudentPageShell title="カレンダー" backHref="/dashboard" backLabel="ダッシュボード">
      <p className="mb-6 text-sm text-muted">
        模試・小テスト、宿題・タスク、参考書の開始・終了予定日を一覧できます。
      </p>
      <ScheduleCalendar events={events} />
    </StudentPageShell>
  )
}
