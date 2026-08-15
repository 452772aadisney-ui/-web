import Link from 'next/link'
import { requireProfile } from '@/app/profile/actions'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { StudentQrCode } from '@/components/student/StudentQrCode'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNameForProfile } from '@/lib/tags/queries'

export default async function StudentProfilePage() {
  const profile = await requireProfile()
  const isStudent = profile.role === 'student'
  const gradeTagName = isStudent ? await fetchGradeTagNameForProfile(profile.id) : null
  const isKisotsuStudent = isKisotsuGradeTag(gradeTagName)

  return (
    <StudentPageShell
      title="プロフィール編集"
      backHref="/dashboard"
      backLabel="マイページ"
    >
      <div className="space-y-8">
        {isStudent && profile.student_code && !isKisotsuStudent && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">生徒ID（QRコード）</h2>
            <StudentQrCode studentCode={profile.student_code} />
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">基本情報</h2>
          <p className="mb-6 text-sm text-muted">{profile.email}</p>
          <ProfileForm profile={profile} backHref="/dashboard" />
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
