import { describe, expect, it } from 'vitest'
import {
  defaultNotificationPreferences,
  hasAnyNotificationCategoryEnabled,
} from '@/lib/push/preferences'

describe('hasAnyNotificationCategoryEnabled', () => {
  it('is true when any category is on', () => {
    expect(hasAnyNotificationCategoryEnabled(defaultNotificationPreferences())).toBe(true)
    expect(
      hasAnyNotificationCategoryEnabled({
        study_reminder: false,
        announcement: true,
        message: false,
        coaching_reminder: false,
      }),
    ).toBe(true)
  })

  it('is false when all four categories are stopped', () => {
    expect(
      hasAnyNotificationCategoryEnabled({
        study_reminder: false,
        announcement: false,
        message: false,
        coaching_reminder: false,
      }),
    ).toBe(false)
  })
})
