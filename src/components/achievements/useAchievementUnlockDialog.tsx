'use client'

import { useEffect, useRef, useState } from 'react'
import type { UnlockedAchievement } from '@/lib/achievements/unlock'
import { AchievementUnlockDialog } from '@/components/achievements/AchievementUnlockDialog'

export function useAchievementUnlockDialog(
  unlockedAchievements: UnlockedAchievement[] | undefined,
  options?: { onClose?: () => void },
) {
  const [visibleAchievements, setVisibleAchievements] = useState<UnlockedAchievement[]>([])
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!unlockedAchievements?.length) return
    const key = unlockedAchievements.map((item) => item.id).join(',')
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    setVisibleAchievements(unlockedAchievements)
  }, [unlockedAchievements])

  return {
    visibleAchievements,
    dialog: (
      <AchievementUnlockDialog
        achievements={visibleAchievements}
        onClose={() => {
          setVisibleAchievements([])
          options?.onClose?.()
        }}
      />
    ),
  }
}
