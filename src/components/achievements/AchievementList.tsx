'use client'

import { useMemo, useState } from 'react'
import { formatAchievementStars } from '@/lib/achievements/definitions'
import type { AchievementListItem } from '@/lib/achievements/queries'
import { cn } from '@/lib/utils'

type AchievementFilter = 'all' | 'unlocked' | 'locked'

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
          {!item.unlocked && (
            <p className="mt-2 text-xs font-medium text-muted">未達成</p>
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

function AchievementSection({
  title,
  items,
}: {
  title: string
  items: AchievementListItem[]
}) {
  if (items.length === 0) return null

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-muted">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <AchievementCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

export function AchievementList({
  lockedItems,
  unlockedItems,
  unlockedCount,
  totalCount,
}: {
  lockedItems: AchievementListItem[]
  unlockedItems: AchievementListItem[]
  unlockedCount: number
  totalCount: number
}) {
  const [filter, setFilter] = useState<AchievementFilter>('all')
  const lockedCount = lockedItems.length

  const tabs: Array<{ id: AchievementFilter; label: string; count: number }> = [
    { id: 'all', label: 'すべて', count: totalCount },
    { id: 'unlocked', label: '達成済み', count: unlockedCount },
    { id: 'locked', label: '未達成', count: lockedCount },
  ]

  const visible = useMemo(() => {
    if (filter === 'unlocked') {
      return { lockedItems: [] as AchievementListItem[], unlockedItems }
    }
    if (filter === 'locked') {
      return { lockedItems, unlockedItems: [] as AchievementListItem[] }
    }
    return { lockedItems, unlockedItems }
  }, [filter, lockedItems, unlockedItems])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
        達成数:{' '}
        <span className="font-bold text-primary">
          {unlockedCount} / {totalCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="実績の表示切替">
        {tabs.map((tab) => {
          const active = filter === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                active
                  ? 'bg-primary text-white'
                  : 'border border-border bg-background text-foreground hover:bg-card',
              )}
            >
              {tab.label}（{tab.count}）
            </button>
          )
        })}
      </div>

      {filter === 'all' && (
        <div className="space-y-8">
          <AchievementSection title="未達成" items={visible.lockedItems} />
          <AchievementSection title="達成済み" items={visible.unlockedItems} />
        </div>
      )}
      {filter === 'unlocked' && (
        <AchievementSection title="達成済み" items={visible.unlockedItems} />
      )}
      {filter === 'locked' && (
        <AchievementSection title="未達成" items={visible.lockedItems} />
      )}

      {filter === 'unlocked' && visible.unlockedItems.length === 0 && (
        <p className="text-sm text-muted">達成済みの実績はまだありません。</p>
      )}
      {filter === 'locked' && visible.lockedItems.length === 0 && (
        <p className="text-sm text-muted">未達成の実績はありません。</p>
      )}
    </div>
  )
}
