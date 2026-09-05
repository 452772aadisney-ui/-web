'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  defaultNotificationPreferences,
  isNotificationPreferenceCategory,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import {
  ensurePreferencesRowThenUpdateCategory,
  type PreferenceRow,
} from '@/lib/push/preferences-write'
import type { NotificationPreferenceCategory } from '@/types/push'
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
 * Load the signed-in student's notification preferences via RLS.
 * Missing row → treat as all ON without writing (until first update / push enable).
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

function createPreferencesWriteClient(userId: string) {
  return {
    async selectPreferences(): Promise<
      { ok: true; row: PreferenceRow | null } | { ok: false }
    > {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('study_reminder, announcement, message, coaching_reminder')
        .eq('user_id', userId)
        .maybeSingle<PreferenceColumns>()

      if (error) return { ok: false }
      return { ok: true, row: data ? toView(data) : null }
    },

    async insertDefaults(): Promise<{ ok: true } | { ok: false; conflict: boolean }> {
      const supabase = await createClient()
      const defaults = defaultNotificationPreferences()
      const { error } = await supabase.from('notification_preferences').insert({
        user_id: userId,
        ...defaults,
      })

      if (!error) return { ok: true }
      // Unique violation: another request created the row first.
      if (error.code === '23505') return { ok: false, conflict: true }
      return { ok: false, conflict: false }
    },

    async updateCategory(
      category: NotificationPreferenceCategory,
      enabled: boolean,
    ): Promise<{ ok: true; updated: boolean } | { ok: false }> {
      const supabase = await createClient()
      // Only the allowlisted column is updated (dynamic key is validated upstream).
      const patch: Partial<PreferenceColumns> = { [category]: enabled }

      const { data, error } = await supabase
        .from('notification_preferences')
        .update(patch)
        .eq('user_id', userId)
        .select('user_id')
        .maybeSingle<{ user_id: string }>()

      if (error) return { ok: false }
      return { ok: true, updated: Boolean(data) }
    },
  }
}

/**
 * Update a single preference column for the signed-in student.
 * Missing row → INSERT defaults (all ON) → UPDATE one column → SELECT confirmed values.
 * Does not overwrite other columns with stale client state.
 */
export async function updateNotificationPreference(input: {
  category: string
  enabled: boolean
}): Promise<NotificationPreferenceUpdateResult> {
  const auth = await requireStudentUserId()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!isNotificationPreferenceCategory(input.category)) {
    return { ok: false, error: 'invalid' }
  }
  if (typeof input.enabled !== 'boolean') {
    return { ok: false, error: 'invalid' }
  }

  const result = await ensurePreferencesRowThenUpdateCategory(
    createPreferencesWriteClient(auth.userId),
    input.category,
    input.enabled,
  )

  if (!result.ok) {
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/dashboard/notifications')
  return { ok: true, preferences: result.preferences }
}
