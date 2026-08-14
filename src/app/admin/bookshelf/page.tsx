import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfManager } from '@/components/textbooks/AdminBookshelfManager'
import {
  TEXTBOOK_SUBJECT_CATEGORIES,
  type TextbookSubjectCategoryLabel,
} from '@/lib/constants/textbook-subject-categories'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import {
  fetchAdminBookshelfOverview,
  fetchTextbookCatalog,
} from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

function parseTab(value: string | undefined): 'register' | 'browse' {
  return value === 'register' ? 'register' : 'browse'
}

function parseSubject(value: string | undefined): TextbookSubjectCategoryLabel {
  const found = TEXTBOOK_SUBJECT_CATEGORIES.find((category) => category.label === value)
  return found?.label ?? TEXTBOOK_SUBJECT_CATEGORIES[0].label
}

export default async function AdminBookshelfPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; subject?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const initialTab = parseTab(params.tab)
  const initialSubject = parseSubject(params.subject)

  const [overview, students, gradeTagByStudentId, catalog] = await Promise.all([
    fetchAdminBookshelfOverview(),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
    fetchTextbookCatalog(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell title="本棚" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">管理者本棚</h2>
        <p className="mt-1 text-sm text-muted">
          参考書の登録と一覧をここで行います。「参考書を登録」で本棚追加・生徒への直接登録、「本棚を見る」で科目別に確認・編集できます。
        </p>
        <div className="mt-6">
          <AdminBookshelfManager
            overview={overview}
            studentGroups={studentGroups}
            catalog={catalog}
            initialTab={initialTab}
            initialSubject={initialSubject}
          />
        </div>
      </section>
    </AdminPageShell>
  )
}
