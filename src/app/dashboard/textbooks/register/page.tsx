import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentBookshelfManager } from '@/components/textbooks/StudentBookshelfManager'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { resolveInitialSubjectCategoryForProfile } from '@/lib/constants/textbook-subject-categories'

export default async function TextbookRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; mode?: string }>
}) {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const params = await searchParams

  if (params.mode !== 'create') {
    redirect('/dashboard/textbooks/search')
  }

  const profileSubjects = profile.subjects ?? []
  const initialSubject = resolveInitialSubjectCategoryForProfile(
    profileSubjects,
    params.subject,
  )

  return (
    <StudentPageShell title="教材を新規作成" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">リストにない参考書を登録</h2>
          <p className="mt-1 text-sm text-muted">
            管理者本棚にない参考書を、自分で新規作成して登録できます。
          </p>
          <div className="mt-6">
            <StudentBookshelfManager
              variant="register-create-only"
              studentId={profile.id}
              profileSubjects={profileSubjects}
              textbooks={[]}
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
