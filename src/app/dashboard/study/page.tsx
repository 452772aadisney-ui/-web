import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyLogForm } from '@/components/study/StudyLogForm'
import { fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function StudentStudyRecordPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const textbooks = await fetchTextbooksForStudent(profile.id)
  const profileSubjects = profile.subjects ?? []

  return (
    <StudentPageShell title="学習を記録する" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">学習を記録する</h2>
          <p className="mt-1 text-sm text-muted">
            プロフィールの使用科目と登録済み教材から選んで記録します。科目は本棚と同じ区分（英語・数学・現代文など）で表示されます。
          </p>
          <div className="mt-6">
            <StudyLogForm profileSubjects={profileSubjects} textbooks={textbooks} />
          </div>
        </section>

        <p className="text-center text-sm text-muted">
          これまでの記録は{' '}
          <Link href="/dashboard/study/history" className="text-primary hover:underline">
            学習履歴
          </Link>
          から確認できます。
        </p>
      </div>
    </StudentPageShell>
  )
}
