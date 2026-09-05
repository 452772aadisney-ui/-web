import {
  defaultNotificationPreferences,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import type { NotificationPreferenceCategory } from '@/types/push'

export type PreferenceRow = NotificationPreferencesView

export type PreferenceWriteClient = {
  selectPreferences: () => Promise<
    { ok: true; row: PreferenceRow | null } | { ok: false }
  >
  insertDefaults: () => Promise<
    { ok: true } | { ok: false; conflict: boolean }
  >
  updateCategory: (
    category: NotificationPreferenceCategory,
    enabled: boolean,
  ) => Promise<{ ok: true; updated: boolean } | { ok: false }>
}

/**
 * Persist one preference column without overwriting the other three.
 *
 * Flow:
 * 1. If no row, INSERT defaults (all ON)
 * 2. Unique conflicts are treated as "row already exists"
 * 3. UPDATE only the target column
 * 4. SELECT final values (via selectPreferences) for the caller
 */
export async function ensurePreferencesRowThenUpdateCategory(
  client: PreferenceWriteClient,
  category: NotificationPreferenceCategory,
  enabled: boolean,
): Promise<
  | { ok: true; preferences: PreferenceRow }
  | { ok: false; reason: 'insert_failed' | 'update_failed' | 'select_failed' | 'update_noop' }
> {
  const selected = await client.selectPreferences()
  if (!selected.ok) {
    return { ok: false, reason: 'select_failed' }
  }

  if (!selected.row) {
    const inserted = await client.insertDefaults()
    if (!inserted.ok && !inserted.conflict) {
      return { ok: false, reason: 'insert_failed' }
    }
  }

  const updated = await client.updateCategory(category, enabled)
  if (!updated.ok) {
    return { ok: false, reason: 'update_failed' }
  }
  if (!updated.updated) {
    return { ok: false, reason: 'update_noop' }
  }

  const confirmed = await client.selectPreferences()
  if (!confirmed.ok || !confirmed.row) {
    return { ok: false, reason: 'select_failed' }
  }

  return { ok: true, preferences: confirmed.row }
}

/** Build INSERT payload: all defaults ON, then apply the toggled column. */
export function buildInsertDefaultsWithCategory(
  category: NotificationPreferenceCategory,
  enabled: boolean,
): PreferenceRow {
  return {
    ...defaultNotificationPreferences(),
    [category]: enabled,
  }
}
