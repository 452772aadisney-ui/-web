import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfManager } from '@/components/textbooks/AdminBookshelfManager'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchAdminBookshelfOverview } from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminBookshelfPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [overview, students, gradeTagByStudentId] = await Promise.all([
    fetchAdminBookshelfOverview(),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell title="本棚" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">管理者本棚</h2>
        <p className="mt-1 text-sm text-muted">
          参考書マスタと生徒の登録教材を一覧できます。右上のペンアイコンから名前・公開設定・利用生徒を編集できます。
        </p>
        <div className="mt-6">
          <AdminBookshelfManager overview={overview} studentGroups={studentGroups} />
        </div>
      </section>
    </AdminPageShell>
  )
}
