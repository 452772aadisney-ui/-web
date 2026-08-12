import { redirect } from 'next/navigation'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentInfoCard } from '@/components/student/StudentInfoCard'
import { fetchTagsForProfile } from '@/lib/tags/queries'

export default async function StudentInfoPage() {
  const { profile, error } = await getCurrentProfileWithError()

  if (!profile) {
    return (
      <StudentPageShell title="生徒情報" backHref="/dashboard" backLabel="マイページ">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-bold text-red-800">プロフィールを読み込めません</h2>
          {error && (
            <p className="mt-3 rounded bg-red-100 px-3 py-2 font-mono text-xs text-red-800">
              詳細: {error}
            </p>
          )}
        </section>
      </StudentPageShell>
    )
  }

  if (profile.role !== 'student') {
    redirect('/admin')
  }

  const studentTags = await fetchTagsForProfile(profile.id)

  return (
    <StudentPageShell title="生徒情報" backHref="/dashboard" backLabel="マイページ">
      <StudentInfoCard profile={profile} tags={studentTags} />
    </StudentPageShell>
  )
}
