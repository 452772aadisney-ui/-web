/**
 * Admin-only notification category control (server-only).
 * true = Push-first with email fallback; false = both channels stopped.
 * Students cannot mutate these rows after migration 051.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  defaultNotificationPreferences,
  isNotificationPreferenceCategory,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import { ensurePreferencesRowThenUpdateCategory } from '@/lib/push/preferences-write'
import type { NotificationPreferenceCategory } from '@/types/push'
import type { Profile } from '@/types/database'

const REASON_MAX = 120

export type AdminNotificationPrefsSnapshot = {
  preferences: NotificationPreferencesView
  fromDatabase: boolean
  updatedAt: string | null
  lastChangedByLabel: string | null
  lastChangedAt: string | null
}

export type AdminPreferenceUpdateResult =
  | { ok: true; snapshot: AdminNotificationPrefsSnapshot }
  | {
      ok: false
      code:
        | 'unauthorized'
        | 'forbidden'
        | 'invalid_target'
        | 'invalid_input'
        | 'admin_unavailable'
        | 'save_failed'
    }

async function requireAdminUserId(): Promise<
  | { ok: true; adminUserId: string }
  | { ok: false; code: 'unauthorized' | 'forbidden' }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, code: 'unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'role'>>()

  if (!profile || profile.role !== 'admin') {
    return { ok: false, code: 'forbidden' }
  }

  return { ok: true, adminUserId: user.id }
}

async function assertStudentTarget(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  studentUserId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', studentUserId)
    .maybeSingle<{ id: string; role: string }>()

  return !error && Boolean(data) && data!.role === 'student'
}

function sanitizeReason(raw: string | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, REASON_MAX)
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

async function loadSnapshot(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  studentUserId: string,
): Promise<AdminNotificationPrefsSnapshot> {
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select(
      'study_reminder, announcement, message, coaching_reminder, updated_at',
    )
    .eq('user_id', studentUserId)
    .maybeSingle<{
      study_reminder: boolean
      announcement: boolean
      message: boolean
      coaching_reminder: boolean
      updated_at: string
    }>()

  if (!prefs) {
    return {
      preferences: defaultNotificationPreferences(),
      fromDatabase: false,
      updatedAt: null,
      lastChangedByLabel: null,
      lastChangedAt: null,
    }
  }

  const { data: change } = await admin
    .from('notification_preference_changes')
    .select('created_at, changed_by_admin_id')
    .eq('target_user_id', studentUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string; changed_by_admin_id: string }>()

  let lastChangedByLabel: string | null = null
  if (change?.changed_by_admin_id) {
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', change.changed_by_admin_id)
      .maybeSingle<{ full_name: string | null; display_name: string | null }>()

    const label =
      adminProfile?.display_name?.trim() ||
      adminProfile?.full_name?.trim() ||
      null
    lastChangedByLabel = label
  }

  return {
    preferences: toView(prefs),
    fromDatabase: true,
    updatedAt: prefs.updated_at,
    lastChangedByLabel,
    lastChangedAt: change?.created_at ?? null,
  }
}

async function insertAuditChange(params: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>
  targetUserId: string
  adminUserId: string
  category: NotificationPreferenceCategory
  previousValue: boolean
  newValue: boolean
  reason: string | null
}): Promise<boolean> {
  if (params.previousValue === params.newValue) return true

  const { error } = await params.admin.from('notification_preference_changes').insert({
    target_user_id: params.targetUserId,
    changed_by_admin_id: params.adminUserId,
    category: params.category,
    previous_value: params.previousValue,
    new_value: params.newValue,
    reason: params.reason,
  })

  return !error
}

function createAdminPreferenceWriteClient(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  studentUserId: string,
) {
  return {
    async selectPreferences() {
      const { data, error } = await admin
        .from('notification_preferences')
        .select('study_reminder, announcement, message, coaching_reminder')
        .eq('user_id', studentUserId)
        .maybeSingle<{
          study_reminder: boolean
          announcement: boolean
          message: boolean
          coaching_reminder: boolean
        }>()

      if (error) return { ok: false as const }
      return {
        ok: true as const,
        row: data ? toView(data) : null,
      }
    },

    async insertDefaults() {
      const { error } = await admin.from('notification_preferences').insert({
        user_id: studentUserId,
        ...defaultNotificationPreferences(),
      })
      if (!error) return { ok: true as const }
      if (error.code === '23505') return { ok: false as const, conflict: true }
      return { ok: false as const, conflict: false }
    },

    async updateCategory(category: NotificationPreferenceCategory, enabled: boolean) {
      const patch = { [category]: enabled } as Record<string, boolean>
      const { data, error } = await admin
        .from('notification_preferences')
        .update(patch)
        .eq('user_id', studentUserId)
        .select('user_id')
        .maybeSingle<{ user_id: string }>()

      if (error) return { ok: false as const }
      return { ok: true as const, updated: Boolean(data) }
    },
  }
}

export async function getAdminStudentNotificationPrefs(
  studentUserId: string,
): Promise<
  | { ok: true; snapshot: AdminNotificationPrefsSnapshot }
  | { ok: false; code: 'unauthorized' | 'forbidden' | 'invalid_target' | 'admin_unavailable' }
> {
  const auth = await requireAdminUserId()
  if (!auth.ok) return { ok: false, code: auth.code }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  if (!(await assertStudentTarget(admin, studentUserId))) {
    return { ok: false, code: 'invalid_target' }
  }

  return { ok: true, snapshot: await loadSnapshot(admin, studentUserId) }
}

/**
 * Update one category for a student. Records audit only when the value changes.
 */
export async function updateAdminStudentNotificationPreference(params: {
  studentUserId: string
  category: string
  enabled: boolean
  reason?: string
}): Promise<AdminPreferenceUpdateResult> {
  const auth = await requireAdminUserId()
  if (!auth.ok) return { ok: false, code: auth.code }

  if (!isNotificationPreferenceCategory(params.category)) {
    return { ok: false, code: 'invalid_input' }
  }
  if (typeof params.enabled !== 'boolean') {
    return { ok: false, code: 'invalid_input' }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  if (!(await assertStudentTarget(admin, params.studentUserId))) {
    return { ok: false, code: 'invalid_target' }
  }

  const writeClient = createAdminPreferenceWriteClient(admin, params.studentUserId)
  const before = await writeClient.selectPreferences()
  if (!before.ok) return { ok: false, code: 'save_failed' }

  const previousValue = before.row
    ? before.row[params.category]
    : defaultNotificationPreferences()[params.category]

  if (before.row && previousValue === params.enabled) {
    return { ok: true, snapshot: await loadSnapshot(admin, params.studentUserId) }
  }

  const updated = await ensurePreferencesRowThenUpdateCategory(
    writeClient,
    params.category,
    params.enabled,
  )
  if (!updated.ok) return { ok: false, code: 'save_failed' }

  const audited = await insertAuditChange({
    admin,
    targetUserId: params.studentUserId,
    adminUserId: auth.adminUserId,
    category: params.category,
    previousValue,
    newValue: params.enabled,
    reason: sanitizeReason(params.reason),
  })
  if (!audited) {
    console.error('[admin-notification-prefs] audit insert failed')
    return { ok: false, code: 'save_failed' }
  }

  return { ok: true, snapshot: await loadSnapshot(admin, params.studentUserId) }
}

/**
 * Set all four categories to the same enabled flag (per-category audit rows).
 */
export async function updateAdminStudentNotificationPreferencesBulk(params: {
  studentUserId: string
  enabled: boolean
  reason?: string
}): Promise<AdminPreferenceUpdateResult> {
  const auth = await requireAdminUserId()
  if (!auth.ok) return { ok: false, code: auth.code }
  if (typeof params.enabled !== 'boolean') {
    return { ok: false, code: 'invalid_input' }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  if (!(await assertStudentTarget(admin, params.studentUserId))) {
    return { ok: false, code: 'invalid_target' }
  }

  const categories = [
    'study_reminder',
    'announcement',
    'message',
    'coaching_reminder',
  ] as const satisfies readonly NotificationPreferenceCategory[]

  for (const category of categories) {
    const one = await updateAdminStudentNotificationPreference({
      studentUserId: params.studentUserId,
      category,
      enabled: params.enabled,
      reason: params.reason,
    })
    if (!one.ok) return one
  }

  return { ok: true, snapshot: await loadSnapshot(admin, params.studentUserId) }
}
