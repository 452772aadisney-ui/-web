import Link from 'next/link'
import type {
  AdminAchievementOverview,
  AdminAchievementStatusRow,
  AdminStudentRankingRow,
} from '@/lib/achievements/admin-queries'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<AdminAchievementStatusRow['category'], string> = {
  beginner: 'はじめの一歩',
  streak: '連続記録',
  total: '累計',
  daily: '1日',
  balance: 'バランス',
  secret: 'シークレット',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function RankingTable({ rankings }: { rankings: AdminStudentRankingRow[] }) {
  if (rankings.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-2 font-semibold">順位</th>
            <th className="px-3 py-2 font-semibold">生徒</th>
            <th className="px-3 py-2 font-semibold">獲得☆</th>
            <th className="px-3 py-2 font-semibold">実績数</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row) => (
            <tr key={row.studentId} className="border-b border-border/70">
              <td className="px-3 py-2 font-medium">{row.rank}位</td>
              <td className="px-3 py-2">
                <Link
                  href={`/admin/students/${row.studentId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-2">
                {row.totalStars}
                <span className="ml-0.5 text-amber-500">☆</span>
              </td>
              <td className="px-3 py-2 text-muted">{row.unlockedCount}件</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AchievementStatusTable({ achievements }: { achievements: AdminAchievementStatusRow[] }) {
  return (
    <div className="space-y-4">
      {achievements.map((achievement) => {
        const completionRate =
          achievement.totalStudents > 0
            ? Math.round((achievement.unlockedCount / achievement.totalStudents) * 100)
            : 0

        return (
          <article
            key={achievement.id}
            className={cn(
              'rounded-xl border border-border bg-background p-4',
              achievement.secret && 'border-amber-200/80 bg-amber-50/40',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{achievement.title}</h3>
                  {achievement.starsLabel && (
                    <span className="text-sm text-amber-500">{achievement.starsLabel}</span>
                  )}
                  <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted">
                    {CATEGORY_LABELS[achievement.category]}
                  </span>
                  {achievement.secret && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      シークレット
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{achievement.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold">{achievement.unlockedCount}人</p>
                <p className="text-xs text-muted">
                  / {achievement.totalStudents}人 ({completionRate}%)
                </p>
              </div>
            </div>

            {achievement.unlockedStudents.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-border/70 pt-3 text-sm">
                {achievement.unlockedStudents.map((student) => (
                  <li key={`${achievement.id}-${student.studentId}`} className="flex flex-wrap gap-x-2">
                    <Link
                      href={`/admin/students/${student.studentId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {student.name}
                    </Link>
                    <span className="text-muted">{formatDateTime(student.unlockedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-border/70 pt-3 text-sm text-muted">
                まだ達成した生徒はいません。
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function AdminAchievementOverview({ overview }: { overview: AdminAchievementOverview }) {
  const totalUnlocked = overview.achievements.reduce(
    (sum, achievement) => sum + achievement.unlockedCount,
    0,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">☆ランキング</h2>
        <p className="mt-1 text-sm text-muted">
          登録生徒 {overview.registeredStudentCount}人 / 表示上の母数 {overview.rankingPoolSize}人
        </p>
        <div className="mt-4">
          <RankingTable rankings={overview.rankings} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">実績一覧と達成状況</h2>
        <p className="mt-1 text-sm text-muted">
          登録されている実績 {overview.achievements.length}件（シークレット含む）。合計達成記録{' '}
          {totalUnlocked}件。
        </p>
        <div className="mt-4">
          <AchievementStatusTable achievements={overview.achievements} />
        </div>
      </section>
    </div>
  )
}
