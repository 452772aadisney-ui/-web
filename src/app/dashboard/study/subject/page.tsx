import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyLogSubjectForm } from '@/components/study/StudyLogSubjectForm'

export default async function StudentStudySubjectPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const profileSubjects = profile.subjects ?? []

  return (
    <StudentPageShell
      title="教科で登録"
      backHref="/dashboard/study"
      backLabel="登録方法を選ぶ"
    >
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">教科で登録</h2>
          <p className="mt-1 text-sm text-muted">
            14科目から選んで学習時間を記録します。参考書の指定は不要です。
          </p>
          <div className="mt-6">
            <StudyLogSubjectForm profileSubjects={profileSubjects} />
          </div>
        </section>

        <p className="text-center text-sm text-muted">
          <Link href="/dashboard/study/textbook" className="text-primary hover:underline">
            参考書で登録する
          </Link>
          {' / '}
          <Link href="/dashboard/study/history" className="text-primary hover:underline">
            学習履歴
          </Link>
        </p>
      </div>
    </StudentPageShell>
  )
}
