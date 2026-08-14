import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBulkTextbookRegister } from '@/components/textbooks/AdminBulkTextbookRegister'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchTextbookCatalog } from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminTextbooksPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [students, gradeTagByStudentId, catalog] = await Promise.all([
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
    fetchTextbookCatalog(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell title="参考書登録" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">参考書スケジュール（生徒別）</h2>
        <p className="mb-6 text-sm text-muted">
          学年ごとに生徒を選び、複数人に同時に参考書を登録できます。本棚の参考書から選ぶか、新規入力も可能です。
        </p>
        <AdminBulkTextbookRegister studentGroups={studentGroups} catalog={catalog} />
      </section>
    </AdminPageShell>
  )
}
