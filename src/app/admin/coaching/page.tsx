import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingManager } from '@/components/coaching/AdminCoachingManager'
import {
  fetchCoachingBookingsForAdmin,
  fetchCoachingCoaches,
  fetchCoachingSlotsForAdmin,
} from '@/lib/coaching/queries'

export default async function AdminCoachingPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [coaches, slots, bookings] = await Promise.all([
    fetchCoachingCoaches(),
    fetchCoachingSlotsForAdmin(),
    fetchCoachingBookingsForAdmin(),
  ])

  return (
    <AdminPageShell title="コーチング予約" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        担当講師と予約枠を登録します。生徒は担当を選んで空き枠から予約できます。
      </p>
      <AdminCoachingManager coaches={coaches} slots={slots} bookings={bookings} />
    </AdminPageShell>
  )
}
