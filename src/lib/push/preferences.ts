import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceCategory,
  type NotificationPreferencesRow,
} from '@/types/push'

export const NOTIFICATION_PREFERENCE_CATEGORIES = [
  'study_reminder',
  'announcement',
  'message',
  'coaching_reminder',
] as const satisfies readonly NotificationPreferenceCategory[]

export type NotificationPreferencesView = Pick<
  NotificationPreferencesRow,
  NotificationPreferenceCategory
>

export function isNotificationPreferenceCategory(
  value: string,
): value is NotificationPreferenceCategory {
  return (NOTIFICATION_PREFERENCE_CATEGORIES as readonly string[]).includes(value)
}

export function defaultNotificationPreferences(): NotificationPreferencesView {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES }
}

export const NOTIFICATION_PREFERENCE_COPY: Record<
  NotificationPreferenceCategory,
  { title: string; description: string }
> = {
  study_reminder: {
    title: '学習記録のリマインダー',
    description: 'その日の学習記録がない場合、22:00ごろにお知らせします。',
  },
  announcement: {
    title: '新しいお知らせ',
    description: '新しいお知らせが届いたときに通知します。',
  },
  message: {
    title: '新しいメッセージ',
    description: '新しいメッセージが届いたときに通知します。',
  },
  coaching_reminder: {
    title: 'コーチングのお知らせ',
    description: 'コーチングに関するお知らせを通知します。',
  },
}

/** Display label for admin-controlled category status (student UI). */
export function notificationCategoryStatusLabel(enabled: boolean): string {
  return enabled ? '有効' : '停止中'
}
