import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingMenu, AdminCoachingMenuDescriptions } from '@/components/coaching/AdminCoachingMenu'
import { AdminCoachingUnbookedList } from '@/components/coaching/AdminCoachingUnbookedList'
import { fetchStudentsWithoutCoachingBookingThisWeek } from '@/lib/coaching/queries'

export default async function AdminCoachingPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const unbookedStudents = await fetchStudentsWithoutCoachingBookingThisWeek()

  return (
    <AdminPageShell title="コーチング" backHref="/admin" backLabel="管理画面">
      <AdminCoachingMenu />
      <AdminCoachingUnbookedList students={unbookedStudents} />
      <AdminCoachingMenuDescriptions />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/admin" className="text-primary hover:underline">
          管理画面に戻る
        </Link>
      </p>
    </AdminPageShell>
  )
}
