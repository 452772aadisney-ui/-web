import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingKarteStudentList } from '@/components/coaching/AdminCoachingKarteStudentList'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminCoachingKartePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [students, gradeTagByStudentId] = await Promise.all([
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell title="カルテ" backHref="/admin/coaching" backLabel="コーチング" wide>
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        生徒を選んでコーチングカルテを入力・閲覧します。学年ごとに表示しています。
      </p>
      <AdminCoachingKarteStudentList groups={studentGroups} />
    </AdminPageShell>
  )
}
