import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingBookings } from '@/components/coaching/AdminCoachingBookings'
import { fetchCoachingBookingsForAdmin } from '@/lib/coaching/queries'

export default async function AdminCoachingBookingsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const bookings = await fetchCoachingBookingsForAdmin()

  return (
    <AdminPageShell title="コーチング予約確認" backHref="/admin" backLabel="管理画面">
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        生徒から入ったコーチング予約の確認・完了・キャンセルができます。
      </p>
      <AdminCoachingBookings bookings={bookings} />
    </AdminPageShell>
  )
}
