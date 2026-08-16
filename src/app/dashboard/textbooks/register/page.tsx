import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentBookshelfManager } from '@/components/textbooks/StudentBookshelfManager'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { resolveInitialSubjectCategoryForProfile } from '@/lib/constants/textbook-subject-categories'
import {
  fetchStudentCatalogIds,
  fetchTextbookCatalogForStudent,
} from '@/lib/textbooks/catalog-queries'

export default async function TextbookRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>
}) {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const [catalog, registeredCatalogIds] = await Promise.all([
    fetchTextbookCatalogForStudent(profile.id),
    fetchStudentCatalogIds(profile.id),
  ])

  const profileSubjects = profile.subjects ?? []
  const initialSubject = resolveInitialSubjectCategoryForProfile(
    profileSubjects,
    params.subject,
  )

  return (
    <StudentPageShell title="教材登録" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">教材登録</h2>
          <p className="mt-1 text-sm text-muted">
            科目を選んでから、管理者本棚のリストから参考書を選ぶか、新規に作成できます。
          </p>
          <div className="mt-6">
            <StudentBookshelfManager
              variant="register"
              studentId={profile.id}
              profileSubjects={profileSubjects}
              textbooks={[]}
              catalog={catalog}
              registeredCatalogIds={[...registeredCatalogIds]}
              editHref="/dashboard/profile"
              initialSubject={initialSubject}
            />
          </div>
        </section>

        <p className="text-sm text-muted">
          登録済みの参考書は{' '}
          <Link
            href={`/dashboard/bookshelf?subject=${encodeURIComponent(initialSubject)}`}
            className="text-primary hover:underline"
          >
            本棚
          </Link>
          で確認できます。使用科目の変更は{' '}
          <Link href="/dashboard/profile" className="text-primary hover:underline">
            プロフィール編集
          </Link>
          から行えます。
        </p>
      </div>
    </StudentPageShell>
  )
}
