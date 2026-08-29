import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfNav } from '@/components/textbooks/AdminBookshelfNav'
import { AdminBulkTextbookRegister } from '@/components/textbooks/AdminBulkTextbookRegister'
import { AdminCatalogCreateForm } from '@/components/textbooks/AdminCatalogCreateForm'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchTextbookCatalog } from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminBookshelfCreatePage() {
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
    <AdminPageShell title="新規参考書を登録" backHref="/admin/bookshelf/search" backLabel="参考書を検索" wide>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <AdminBookshelfNav active="create" />
          <h2 className="text-lg font-bold">本棚マスタに追加</h2>
          <p className="mt-1 text-sm text-muted">
            参考書名・科目タグ・用途・表紙などを設定して本棚マスタに登録します。
          </p>
          <div className="mt-6">
            <AdminCatalogCreateForm />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">生徒に登録</h2>
          <p className="mt-1 text-sm text-muted">
            本棚の参考書から選ぶか新規入力して、複数の生徒に直接登録できます。
          </p>
          <div className="mt-6">
            <AdminBulkTextbookRegister studentGroups={studentGroups} catalog={catalog} />
          </div>
        </section>
      </div>
    </AdminPageShell>
  )
}
