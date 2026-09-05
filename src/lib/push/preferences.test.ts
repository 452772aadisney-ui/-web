import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  defaultNotificationPreferences,
  isNotificationPreferenceCategory,
} from '@/lib/push/preferences'

describe('notification preferences helpers', () => {
  it('exposes exactly four user-facing categories without test', () => {
    expect(NOTIFICATION_PREFERENCE_CATEGORIES).toEqual([
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder',
    ])
    expect(NOTIFICATION_PREFERENCE_CATEGORIES).not.toContain('test')
    expect(isNotificationPreferenceCategory('test')).toBe(false)
  })

  it('defaults all categories to on', () => {
    expect(defaultNotificationPreferences()).toEqual({
      study_reminder: true,
      announcement: true,
      message: true,
      coaching_reminder: true,
    })
  })
})
