import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingKarteStudentList } from '@/components/coaching/AdminCoachingKarteStudentList'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminCoachingKartePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const students = await fetchStudentList()

  return (
    <AdminPageShell title="カルテ" backHref="/admin/coaching" backLabel="コーチング" wide>
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        生徒を選んでコーチングカルテを入力・閲覧します。
      </p>
      <AdminCoachingKarteStudentList students={students} />
    </AdminPageShell>
  )
}
