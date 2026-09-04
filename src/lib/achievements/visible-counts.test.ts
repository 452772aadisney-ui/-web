import { describe, expect, it } from 'vitest'
import type { AchievementDefinition } from '@/lib/achievements/definitions'
import {
  countVisibleAchievementCards,
  getVisibleAchievements,
  splitVisibleAchievements,
  type AchievementListItem,
} from '@/lib/achievements/queries'

function item(
  id: string,
  unlocked: boolean,
  options?: Partial<AchievementDefinition>,
): AchievementListItem {
  return {
    id,
    title: id,
    description: id,
    stars: 1,
    category: options?.category ?? 'beginner',
    secret: options?.secret,
    unlocked,
    unlockedAt: unlocked ? '2026-01-01T00:00:00.000Z' : null,
  }
}

describe('visible achievement card counts', () => {
  it('counts only the next locked stage in a stacked series', () => {
    const publicItems = [
      item('total_10h', true),
      item('total_25h', true),
      item('total_50h', false),
      item('total_100h', false),
      item('total_200h', false),
      item('first_study_log', false),
    ]

    const visible = getVisibleAchievements(publicItems)
    expect(visible.map((entry) => entry.id)).toEqual([
      'first_study_log',
      'total_10h',
      'total_25h',
      'total_50h',
    ])
  })

  it('excludes locked secrets and includes unlocked secrets in displayed counts', () => {
    const publicItems = [
      item('first_study_log', true),
      item('keep_going', false),
      item('total_10h', false),
      item('total_25h', false),
    ]
    const secretItems = [
      item('secret_night_owl', false, { category: 'secret', secret: true }),
      item('secret_early_bird', true, { category: 'secret', secret: true }),
    ]

    const { lockedItems, unlockedItems } = splitVisibleAchievements(publicItems, secretItems)
    const counts = countVisibleAchievementCards(lockedItems, unlockedItems)

    expect(unlockedItems.map((entry) => entry.id)).toEqual([
      'first_study_log',
      'secret_early_bird',
    ])
    expect(lockedItems.map((entry) => entry.id).sort()).toEqual(
      ['keep_going', 'total_10h'].sort(),
    )
    expect(counts).toEqual({
      unlockedCount: 2,
      lockedCount: 2,
      totalCount: 4,
    })
    expect(counts.totalCount).toBe(counts.unlockedCount + counts.lockedCount)
  })

  it('does not count hidden future stacked stages toward totals', () => {
    const publicItems = [
      item('textbooks_5', true),
      item('textbooks_10', false),
      item('textbooks_15', false),
      item('textbooks_20', false),
    ]
    const { lockedItems, unlockedItems } = splitVisibleAchievements(publicItems, [])
    const counts = countVisibleAchievementCards(lockedItems, unlockedItems)

    expect(unlockedItems).toHaveLength(1)
    expect(lockedItems).toHaveLength(1)
    expect(counts.totalCount).toBe(2)
  })
})
