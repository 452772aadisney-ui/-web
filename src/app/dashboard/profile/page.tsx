import Link from 'next/link'
import { requireProfile } from '@/app/profile/actions'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { StudentPageShell } from '@/components/layout/StudentPageShell'

export default async function StudentProfilePage() {
  const profile = await requireProfile()
  const isStudent = profile.role === 'student'

  return (
    <StudentPageShell
      title="プロフィール編集"
      backHref="/dashboard/info"
      backLabel="生徒情報"
    >
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">基本情報</h2>
          <p className="mb-6 text-sm text-muted">{profile.email}</p>
          <ProfileForm profile={profile} backHref="/dashboard/info" />
        </section>

        {!isStudent && (
          <p className="text-sm text-muted">
            管理者アカウントのプロフィール編集です。{' '}
            <Link href="/admin" className="text-primary hover:underline">
              管理画面へ戻る
            </Link>
          </p>
        )}
      </div>
    </StudentPageShell>
  )
}
