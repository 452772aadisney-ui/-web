import Link from 'next/link'
import { getPersonName } from '@/lib/auth/display-name'
import type { Profile } from '@/types/database'
import type { StudentTag } from '@/types/tag'

function formatBirthday(birthday: string | null): string {
  if (!birthday) return '未設定'
  const [year, month, day] = birthday.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

interface StudentInfoCardProps {
  profile: Profile
  tags: StudentTag[]
}

export function StudentInfoCard({ profile, tags }: StudentInfoCardProps) {
  const personName = getPersonName(profile)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">生徒情報</p>
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
          {tags.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-muted">タグ</dt>
              <dd className="font-medium">
                {tags.map((tag) => `${tag.category}:${tag.name}`).join(' / ')}
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-6">
          <Link href="/dashboard/profile" className="text-sm text-primary hover:underline">
            プロフィールを編集 →
          </Link>
        </p>
      </section>
    </div>
  )
}
