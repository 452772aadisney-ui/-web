'use server'

import { createClient } from '@/lib/supabase/server'
import {
  defaultNotificationPreferences,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import type { Profile } from '@/types/database'

export type NotificationPreferencesResult =
  | { ok: true; preferences: NotificationPreferencesView; fromDatabase: boolean }
  | { ok: false; error: 'unauthorized' | 'forbidden' | 'load_failed' }

export type NotificationPreferenceUpdateResult =
  | { ok: true; preferences: NotificationPreferencesView }
  | {
      ok: false
      error: 'unauthorized' | 'forbidden' | 'invalid' | 'save_failed'
    }

type PreferenceColumns = {
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
}

async function requireStudentUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: 'unauthorized' | 'forbidden' }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'role'>>()

  if (!profile || profile.role !== 'student') {
    return { ok: false, error: 'forbidden' }
  }

  return { ok: true, userId: user.id }
}

function toView(row: PreferenceColumns): NotificationPreferencesView {
  return {
    study_reminder: row.study_reminder,
    announcement: row.announcement,
    message: row.message,
    coaching_reminder: row.coaching_reminder,
  }
}

/**
 * Load the signed-in student's notification preferences via RLS (SELECT only).
 * Missing row → treat as all ON without writing.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferencesResult> {
  const auth = await requireStudentUserId()
  if (!auth.ok) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('study_reminder, announcement, message, coaching_reminder')
    .eq('user_id', auth.userId)
    .maybeSingle<PreferenceColumns>()

  if (error) {
    return { ok: false, error: 'load_failed' }
  }

  if (!data) {
    return {
      ok: true,
      preferences: defaultNotificationPreferences(),
      fromDatabase: false,
    }
  }

  return { ok: true, preferences: toView(data), fromDatabase: true }
}

/**
 * Students cannot change notification categories (admin-only after migration 051).
 * Kept as a rejected endpoint so old clients cannot mutate prefs.
 */
export async function updateNotificationPreference(_input: {
  category: string
  enabled: boolean
}): Promise<NotificationPreferenceUpdateResult> {
  return { ok: false, error: 'forbidden' }
}
