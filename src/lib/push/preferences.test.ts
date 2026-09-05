import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  defaultNotificationPreferences,
  isNotificationPreferenceCategory,
  notificationCategoryStatusLabel,
} from '@/lib/push/preferences'

describe('notification preferences helpers', () => {
  it('exposes the four admin-controlled categories', () => {
    expect(NOTIFICATION_PREFERENCE_CATEGORIES).toEqual([
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder',
    ])
  })

  it('defaults all categories to enabled', () => {
    expect(defaultNotificationPreferences()).toEqual({
      study_reminder: true,
      announcement: true,
      message: true,
      coaching_reminder: true,
    })
  })

  it('validates category tokens', () => {
    expect(isNotificationPreferenceCategory('study_reminder')).toBe(true)
    expect(isNotificationPreferenceCategory('test')).toBe(false)
  })

  it('labels student-facing status without switches', () => {
    expect(notificationCategoryStatusLabel(true)).toBe('有効')
    expect(notificationCategoryStatusLabel(false)).toBe('停止中')
  })
})
