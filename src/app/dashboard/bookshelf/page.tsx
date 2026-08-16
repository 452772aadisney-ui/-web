import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentBookshelfManager } from '@/components/textbooks/StudentBookshelfManager'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { resolveInitialSubjectCategoryForProfile } from '@/lib/constants/textbook-subject-categories'
import { markTextbooksAsSeen } from '@/lib/textbooks/catalog-queries'
import { fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function BookshelfPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>
}) {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const params = await searchParams
  const textbooks = await fetchTextbooksForStudent(profile.id)

  await markTextbooksAsSeen(profile.id)

  const profileSubjects = profile.subjects ?? []
  const initialSubject = resolveInitialSubjectCategoryForProfile(
    profileSubjects,
    params.subject,
  )

  return (
    <StudentPageShell title="本棚" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">登録済みの参考書</h2>
              <p className="mt-1 text-sm text-muted">
                科目を選んで、登録されている参考書を確認できます。
              </p>
            </div>
            <Link
              href={`/dashboard/textbooks/register?subject=${encodeURIComponent(initialSubject)}`}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background"
            >
              教材を登録
            </Link>
          </div>
          <div className="mt-6">
            <StudentBookshelfManager
              variant="list"
              studentId={profile.id}
              profileSubjects={profileSubjects}
              textbooks={textbooks}
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
