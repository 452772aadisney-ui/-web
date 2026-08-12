import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentCoachingBooking } from '@/components/coaching/StudentCoachingBooking'
import {
  fetchAvailableCoachingSlots,
  fetchCoachingBookingsForStudent,
  fetchCoachingCoaches,
} from '@/lib/coaching/queries'

export const dynamic = 'force-dynamic'

export default async function StudentCoachingPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect(getDashboardPathForRole('admin'))

  const [coaches, availableSlots, bookings] = await Promise.all([
    fetchCoachingCoaches(true),
    fetchAvailableCoachingSlots(),
    fetchCoachingBookingsForStudent(profile.id),
  ])

  return (
    <StudentPageShell title="コーチング予約" backHref="/dashboard" backLabel="ダッシュボード">
      <p className="mb-6 text-sm text-muted">
        担当を選んで空き枠から予約できます。伝えておきたいことがあればメモ欄に入力してください。
      </p>
      <StudentCoachingBooking
        coaches={coaches}
        availableSlots={availableSlots}
        bookings={bookings}
      />
    </StudentPageShell>
  )
}
