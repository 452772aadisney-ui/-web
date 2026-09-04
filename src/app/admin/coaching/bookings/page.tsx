import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingBookings } from '@/components/coaching/AdminCoachingBookings'
import { AdminCoachingProxyBooking } from '@/components/coaching/AdminCoachingProxyBooking'
import {
  fetchAvailableCoachingSlots,
  fetchCoachingBookingsForAdmin,
  fetchCoachingCoaches,
  getTodayDateKey,
} from '@/lib/coaching/queries'
import { getDayWindow } from '@/lib/coaching/week'
import { fetchStudentList } from '@/lib/study/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'

export default async function AdminCoachingBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; start?: string; student?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const windowStart = params.start ?? getTodayDateKey()
  const dateKeys = getDayWindow(windowStart).map((day) => day.date)

  const [bookings, coaches, allStudents, gradeTagByStudentId] = await Promise.all([
    fetchCoachingBookingsForAdmin(),
    fetchCoachingCoaches(true),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const students = allStudents.filter(
    (student) => !isKisotsuGradeTag(gradeTagByStudentId.get(student.id)),
  )

  const selectedCoachId =
    params.coach && coaches.some((coach) => coach.id === params.coach)
      ? params.coach
      : coaches[0]?.id ?? null

  const availableSlots = selectedCoachId
    ? await fetchAvailableCoachingSlots(selectedCoachId, dateKeys)
    : []

  const defaultStudentId =
    params.student && students.some((student) => student.id === params.student)
      ? params.student
      : ''

  return (
    <AdminPageShell title="予約確認" backHref="/admin/coaching" backLabel="コーチング">
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        生徒の代理予約、予約の確認・完了・キャンセルができます。
      </p>

      <AdminCoachingProxyBooking
        coaches={coaches}
        students={students}
        selectedCoachId={selectedCoachId}
        windowStart={windowStart}
        availableSlots={availableSlots}
        defaultStudentId={defaultStudentId}
      />

      <div className="mt-8">
        <AdminCoachingBookings bookings={bookings} />
      </div>
    </AdminPageShell>
  )
}
