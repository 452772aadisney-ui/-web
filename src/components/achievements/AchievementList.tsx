import { formatAchievementStars } from '@/lib/achievements/definitions'
import type { AchievementListItem } from '@/lib/achievements/queries'

function AchievementCard({ item }: { item: AchievementListItem }) {
  const stars = formatAchievementStars(item.stars)

  return (
    <article
      className={`rounded-xl border p-4 transition ${
        item.unlocked
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : 'border-border bg-muted/20 opacity-60 grayscale'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`font-bold ${item.unlocked ? 'text-foreground' : 'text-muted'}`}>
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{item.description}</p>
          {item.unlocked && item.unlockedAt && (
            <p className="mt-2 text-xs text-muted">
              達成日:{' '}
              {new Date(item.unlockedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
            </p>
          )}
        </div>
        {stars && (
          <span className={`shrink-0 text-sm ${item.unlocked ? 'text-amber-500' : 'text-muted'}`}>
            {stars}
          </span>
        )}
      </div>
    </article>
  )
}

export function AchievementList({
  items,
  unlockedCount,
  totalCount,
}: {
  items: AchievementListItem[]
  unlockedCount: number
  totalCount: number
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
        達成数:{' '}
        <span className="font-bold text-primary">
          {unlockedCount} / {totalCount}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <AchievementCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
