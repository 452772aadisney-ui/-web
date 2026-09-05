/** Web Push / in-app notification types (DB: public.push_notification_type etc.) */

export type { WebPushPayload } from '@/lib/push/notification-payload'

export type PushNotificationType =
  | 'study_reminder'
  | 'announcement'
  | 'message'
  | 'coaching_reminder'
  | 'test'

/** User-facing preference categories (excludes test). */
export type NotificationPreferenceCategory = Exclude<PushNotificationType, 'test'>

export type NotificationDeliveryChannel = 'push' | 'email'

export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  failure_count: number
  last_success_at: string | null
  last_failure_at: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
}

export interface NotificationPreferencesRow {
  user_id: string
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
  created_at: string
  updated_at: string
}

export interface NotificationEventRow {
  id: string
  user_id: string
  notification_type: PushNotificationType
  idempotency_key: string
  title: string
  body: string
  target_path: string
  occurred_at: string
  created_at: string
  metadata: Record<string, unknown>
}

export interface NotificationDeliveryRow {
  id: string
  event_id: string
  channel: NotificationDeliveryChannel
  subscription_id: string | null
  status: NotificationDeliveryStatus
  http_status: number | null
  error_code: string | null
  attempt_count: number
  sent_at: string | null
  succeeded_at: string | null
  created_at: string
  updated_at: string
}

/** Defaults when creating preferences on first Push enable / admin create. */
export const DEFAULT_NOTIFICATION_PREFERENCES: Pick<
  NotificationPreferencesRow,
  NotificationPreferenceCategory
> = {
  study_reminder: true,
  announcement: true,
  message: true,
  coaching_reminder: true,
}

/**
 * Admin-controlled delivery gate (not student opt-out):
 * true  = Push-first; if Push unavailable/fails → email fallback
 * false = neither Push nor email
 */
export type NotificationCategoryDeliveryGate = boolean

export interface NotificationPreferenceChangeRow {
  id: string
  target_user_id: string
  changed_by_admin_id: string
  category: NotificationPreferenceCategory
  previous_value: boolean
  new_value: boolean
  reason: string | null
  created_at: string
}
