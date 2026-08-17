import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyLogTextbookForm } from '@/components/study/StudyLogTextbookForm'
import { fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function StudentStudyTextbookPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const textbooks = await fetchTextbooksForStudent(profile.id)
  const profileSubjects = profile.subjects ?? []

  return (
    <StudentPageShell title="参考書で登録" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">参考書で登録</h2>
          <div className="mt-6">
            <StudyLogTextbookForm profileSubjects={profileSubjects} textbooks={textbooks} />
          </div>
        </section>

        <p className="text-center text-sm text-muted">
          <Link href="/dashboard/study/history" className="text-primary hover:underline">
            学習履歴
          </Link>
        </p>
      </div>
    </StudentPageShell>
  )
}
