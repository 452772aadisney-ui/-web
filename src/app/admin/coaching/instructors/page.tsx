import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingInstructorsManager } from '@/components/coaching/AdminCoachingInstructorsManager'
import { fetchCoachingCoaches } from '@/lib/coaching/queries'

export default async function AdminCoachingInstructorsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const coaches = await fetchCoachingCoaches()

  return (
    <AdminPageShell title="講師追加" backHref="/admin/coaching" backLabel="コーチング">
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        コーチング担当講師の追加・編集を行います。登録した講師は枠設定や予約画面で選べます。
      </p>
      <AdminCoachingInstructorsManager coaches={coaches} />
    </AdminPageShell>
  )
}
