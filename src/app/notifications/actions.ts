'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  defaultNotificationPreferences,
  isNotificationPreferenceCategory,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
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

function toView(row: {
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
}): NotificationPreferencesView {
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
    .maybeSingle<{
      study_reminder: boolean
      announcement: boolean
      message: boolean
      coaching_reminder: boolean
    }>()

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
 * Update a single preference column for the signed-in student.
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

  const category: NotificationPreferenceCategory = input.category
  const supabase = await createClient()

  const { data: existing, error: selectError } = await supabase
    .from('notification_preferences')
    .select('study_reminder, announcement, message, coaching_reminder')
    .eq('user_id', auth.userId)
    .maybeSingle<{
      study_reminder: boolean
      announcement: boolean
      message: boolean
      coaching_reminder: boolean
    }>()

  if (selectError) {
    return { ok: false, error: 'save_failed' }
  }

  if (!existing) {
    const defaults = defaultNotificationPreferences()
    const insertRow = { ...defaults, [category]: input.enabled, user_id: auth.userId }
    const { data: inserted, error: insertError } = await supabase
      .from('notification_preferences')
      .insert(insertRow)
      .select('study_reminder, announcement, message, coaching_reminder')
      .single<{
        study_reminder: boolean
        announcement: boolean
        message: boolean
        coaching_reminder: boolean
      }>()

    if (insertError || !inserted) {
      return { ok: false, error: 'save_failed' }
    }

    revalidatePath('/dashboard/notifications')
    return { ok: true, preferences: toView(inserted) }
  }

  const { data: updated, error: updateError } = await supabase
    .from('notification_preferences')
    .update({ [category]: input.enabled })
    .eq('user_id', auth.userId)
    .select('study_reminder, announcement, message, coaching_reminder')
    .single<{
      study_reminder: boolean
      announcement: boolean
      message: boolean
      coaching_reminder: boolean
    }>()

  if (updateError || !updated) {
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/dashboard/notifications')
  return { ok: true, preferences: toView(updated) }
}
