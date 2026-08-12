import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { TextbookManager } from '@/components/textbooks/TextbookManager'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { fetchTextbooksForStudent } from '@/lib/study/queries'

export default async function BookshelfPage() {
  const profile = await requireProfile()

  if (profile.role !== 'student') {
    redirect('/dashboard')
  }

  const textbooks = await fetchTextbooksForStudent(profile.id)
  const profileSubjects = profile.subjects ?? []

  return (
    <StudentPageShell title="本棚" backHref="/dashboard" backLabel="ダッシュボード">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">教材登録</h2>
          <p className="mt-1 text-sm text-muted">
            学習記録で選べるテキスト・参考書を登録します。科目タグはプロフィールの使用科目から選べます。
          </p>
          <div className="mt-6">
            <TextbookManager
              studentId={profile.id}
              profileSubjects={profileSubjects}
              textbooks={textbooks}
              editHref="/dashboard/profile"
            />
          </div>
        </section>

        <p className="text-sm text-muted">
          使用科目の変更は{' '}
          <Link href="/dashboard/profile" className="text-primary hover:underline">
            プロフィール編集
          </Link>
          から行えます。
        </p>
      </div>
    </StudentPageShell>
  )
}
