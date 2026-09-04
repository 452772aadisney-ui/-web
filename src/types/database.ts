import type {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationDeliveryRow,
  NotificationEventRow,
  NotificationPreferencesRow,
  PushNotificationType,
  PushSubscriptionRow,
} from '@/types/push'

export type UserRole = 'student' | 'admin'

export type {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationPreferenceCategory,
  NotificationDeliveryRow,
  NotificationEventRow,
  NotificationPreferencesRow,
  PushNotificationType,
  PushSubscriptionRow,
} from '@/types/push'

export interface Profile {
  id: string
  email: string
  full_name: string
  display_name: string
  birthday: string | null
  target_schools: string[]
  subjects: string[]
  student_code: string | null
  role: UserRole
  admin_since: string | null
  faq_intro_seen_at: string | null
  last_accessed_at: string | null
  created_at: string
  updated_at: string
}

export interface ProfileFormData {
  full_name: string
  display_name: string
  birthday: string
  target_schools: string[]
  subjects: string[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          email: string
          full_name?: string
          display_name?: string
          birthday?: string | null
          target_schools?: string[]
          subjects?: string[]
          student_code?: string | null
          role?: UserRole
          admin_since?: string | null
          faq_intro_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          full_name?: string
          display_name?: string
          birthday?: string | null
          target_schools?: string[]
          subjects?: string[]
          student_code?: string | null
          role?: UserRole
          admin_since?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: Omit<
          PushSubscriptionRow,
          'id' | 'created_at' | 'updated_at' | 'failure_count'
        > & {
          id?: string
          failure_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<PushSubscriptionRow, 'id' | 'created_at'>>
        Relationships: []
      }
      notification_preferences: {
        Row: NotificationPreferencesRow
        Insert: {
          user_id: string
          study_reminder?: boolean
          announcement?: boolean
          message?: boolean
          coaching_reminder?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<NotificationPreferencesRow, 'user_id' | 'created_at'>>
        Relationships: []
      }
      notification_events: {
        Row: NotificationEventRow
        Insert: Omit<NotificationEventRow, 'id' | 'created_at' | 'occurred_at' | 'metadata'> & {
          id?: string
          occurred_at?: string
          created_at?: string
          metadata?: Record<string, unknown>
        }
        Update: Partial<Omit<NotificationEventRow, 'id' | 'created_at'>>
        Relationships: []
      }
      notification_deliveries: {
        Row: NotificationDeliveryRow
        Insert: Omit<
          NotificationDeliveryRow,
          'id' | 'created_at' | 'updated_at' | 'attempt_count' | 'status'
        > & {
          id?: string
          status?: NotificationDeliveryStatus
          attempt_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<NotificationDeliveryRow, 'id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      push_notification_type: PushNotificationType
      notification_delivery_channel: NotificationDeliveryChannel
      notification_delivery_status: NotificationDeliveryStatus
    }
    CompositeTypes: Record<string, never>
  }
}
