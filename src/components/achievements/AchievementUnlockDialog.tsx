'use client'

import { formatAchievementStars } from '@/lib/achievements/definitions'
import type { UnlockedAchievement } from '@/lib/achievements/unlock'

interface AchievementUnlockDialogProps {
  achievements: UnlockedAchievement[]
  onClose: () => void
}

export function AchievementUnlockDialog({ achievements, onClose }: AchievementUnlockDialogProps) {
  if (achievements.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-unlock-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="achievement-unlock-title" className="text-center text-lg font-bold">
          🎉 実績を解除しました！
        </h2>

        <ul className="mt-5 space-y-3">
          {achievements.map((achievement) => (
            <li
              key={achievement.id}
              className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-primary">{achievement.title}</p>
                  <p className="mt-1 text-sm text-muted">{achievement.description}</p>
                </div>
                {achievement.stars > 0 && (
                  <span className="shrink-0 text-sm text-amber-500">
                    {formatAchievementStars(achievement.stars)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-hover"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
