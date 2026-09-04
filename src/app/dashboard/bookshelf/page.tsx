import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentBookshelfManager } from '@/components/textbooks/StudentBookshelfManager'
import { BookshelfRegisterButton } from '@/components/textbooks/BookshelfRegisterButton'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { resolveInitialSubjectCategoryForProfile } from '@/lib/constants/textbook-subject-categories'
import { markTextbooksAsSeen } from '@/lib/textbooks/catalog-queries'
import { fetchTextbooksForStudentPaginated } from '@/lib/study/queries'

export default async function BookshelfPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; page?: string }>
}) {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const profileSubjects = profile.subjects ?? []
  const initialSubject = resolveInitialSubjectCategoryForProfile(
    profileSubjects,
    params.subject,
  )

  const pageNumber = params.page ? parseInt(params.page, 10) : 1
  const paginated = await fetchTextbooksForStudentPaginated(profile.id, {
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    subjectCategory: initialSubject,
  })

  await markTextbooksAsSeen(profile.id)

  return (
    <StudentPageShell title="My本棚" backHref="/dashboard" backLabel="マイページ" mainClassName="max-w-4xl">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-bold">登録済みの参考書</h2>
            <BookshelfRegisterButton />
          </div>
          <div className="mt-6">
            <StudentBookshelfManager
              variant="list"
              studentId={profile.id}
              profileSubjects={profileSubjects}
              textbooks={paginated.textbooks}
              totalTextbookCount={paginated.totalCount}
              totalAllTextbookCount={paginated.totalAllCount}
              currentPage={paginated.page}
              pageSize={paginated.pageSize}
              catalog={[]}
              registeredCatalogIds={[]}
              editHref="/dashboard/profile"
              initialSubject={initialSubject}
            />
          </div>
        </section>
      </div>
    </StudentPageShell>
  )
}
