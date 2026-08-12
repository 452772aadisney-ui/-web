import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentCoachingBooking } from '@/components/coaching/StudentCoachingBooking'
import {
  fetchAvailableCoachingSlots,
  fetchCoachingBookingsForStudent,
  fetchCoachingCoaches,
  getTodayDateKey,
} from '@/lib/coaching/queries'
import { getDayWindow } from '@/lib/coaching/week'

export const dynamic = 'force-dynamic'

export default async function StudentCoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; start?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect(getDashboardPathForRole('admin'))

  const params = await searchParams
  const windowStart = params.start ?? getTodayDateKey()
  const dateKeys = getDayWindow(windowStart).map((day) => day.date)

  const coaches = await fetchCoachingCoaches(true)
  const selectedCoachId =
    params.coach && coaches.some((c) => c.id === params.coach)
      ? params.coach
      : coaches[0]?.id ?? null

  const [availableSlots, bookings] = await Promise.all([
    selectedCoachId
      ? fetchAvailableCoachingSlots(selectedCoachId, dateKeys)
      : Promise.resolve([]),
    fetchCoachingBookingsForStudent(profile.id),
  ])

  return (
    <StudentPageShell title="コーチング予約" backHref="/dashboard" backLabel="ダッシュボード">
      <p className="mb-6 text-sm text-muted">
        担当を選び、予約枠から日時を選んで予約してください。各枠は30分です。
      </p>
      <StudentCoachingBooking
        coaches={coaches}
        selectedCoachId={selectedCoachId}
        windowStart={windowStart}
        availableSlots={availableSlots}
        bookings={bookings}
      />
    </StudentPageShell>
  )
}
