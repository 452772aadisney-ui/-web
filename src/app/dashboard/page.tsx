import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfileWithError } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentQrCode } from '@/components/student/StudentQrCode'
import { getPersonName } from '@/lib/auth/display-name'
import { fetchTagsForProfile } from '@/lib/tags/queries'

function formatBirthday(birthday: string | null): string {
  if (!birthday) return '未設定'
  const [year, month, day] = birthday.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

export default async function StudentDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { profile, error } = await getCurrentProfileWithError()

  if (!profile) {
    return (
      <StudentPageShell title="生徒ダッシュボード">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-bold text-red-800">プロフィールを読み込めません</h2>
          <p className="mt-2 text-sm text-red-700">
            Supabase の SQL Editor で{' '}
            <code className="rounded bg-red-100 px-1">004_fix_rls_recursion.sql</code>{' '}
            を実行してから、ページを再読み込みしてください。
          </p>
          {error && (
            <p className="mt-3 rounded bg-red-100 px-3 py-2 font-mono text-xs text-red-800">
              詳細: {error}
            </p>
          )}
        </section>
      </StudentPageShell>
    )
  }

  const personName = getPersonName(profile)
  const studentTags = profile.role === 'student' ? await fetchTagsForProfile(profile.id) : []

  return (
    <StudentPageShell title="生徒ダッシュボード">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">ようこそ</p>
              <h2 className="mt-1 text-2xl font-bold">{personName} さん</h2>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-primary">
              生徒
            </span>
          </div>

          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">誕生日</dt>
              <dd className="font-medium">{formatBirthday(profile.birthday)}</dd>
            </div>
            <div>
              <dt className="text-muted">使用科目</dt>
              <dd className="font-medium">
                {profile.subjects.length > 0 ? profile.subjects.join('・') : '未設定'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">志望校</dt>
              <dd className="font-medium">
                {profile.target_schools.length > 0
                  ? profile.target_schools.join(' / ')
                  : '未設定'}
              </dd>
            </div>
            {studentTags.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-muted">タグ</dt>
                <dd className="font-medium">
                  {studentTags.map((tag) => `${tag.category}:${tag.name}`).join(' / ')}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {profile.role === 'student' && profile.student_code && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">生徒ID（QRコード）</h3>
            <StudentQrCode studentCode={profile.student_code} />
          </section>
        )}

        <p className="text-sm text-muted">
          学習記録・本棚（教材登録）が利用できます。
        </p>
      </div>
    </StudentPageShell>
  )
}
