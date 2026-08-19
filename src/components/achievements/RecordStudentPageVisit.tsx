'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { recordStudentPageVisit } from '@/app/achievements/actions'
import { AchievementUnlockDialog } from '@/components/achievements/AchievementUnlockDialog'
import type { UnlockedAchievement } from '@/lib/achievements/unlock'

export function RecordStudentPageVisit() {
  const pathname = usePathname()
  const [visibleAchievements, setVisibleAchievements] = useState<UnlockedAchievement[]>([])

  useEffect(() => {
    if (!pathname) return

    void recordStudentPageVisit(pathname).then((unlocked) => {
      if (unlocked.length > 0) {
        setVisibleAchievements(unlocked)
      }
    })
  }, [pathname])

  return (
    <AchievementUnlockDialog
      achievements={visibleAchievements}
      onClose={() => setVisibleAchievements([])}
    />
  )
}
