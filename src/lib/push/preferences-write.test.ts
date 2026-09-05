import { describe, expect, it, vi } from 'vitest'
import {
  buildInsertDefaultsWithCategory,
  ensurePreferencesRowThenUpdateCategory,
  type PreferenceRow,
  type PreferenceWriteClient,
} from '@/lib/push/preferences-write'
import { NOTIFICATION_PREFERENCE_CATEGORIES } from '@/lib/push/preferences'

function createMockClient(options: {
  initial: PreferenceRow | null
  failInsert?: boolean
  failUpdate?: boolean
  failSelectAfterUpdate?: boolean
  concurrentCreateOnInsert?: boolean
}): PreferenceWriteClient & { row: PreferenceRow | null; updateCalls: unknown[] } {
  const state = stateFrom(options.initial)
  const updateCalls: unknown[] = []

  return {
    get row() {
      return state.row
    },
    updateCalls,
    async selectPreferences() {
      if (options.failSelectAfterUpdate && state.updatedOnce) {
        return { ok: false as const }
      }
      return { ok: true as const, row: state.row ? { ...state.row } : null }
    },
    async insertDefaults() {
      if (options.failInsert) {
        return { ok: false as const, conflict: false }
      }
      if (options.concurrentCreateOnInsert) {
        // Another request created a row with custom values (not defaults).
        state.row = {
          study_reminder: true,
          announcement: false,
          message: true,
          coaching_reminder: true,
        }
        return { ok: false as const, conflict: true }
      }
      if (state.row) {
        return { ok: false as const, conflict: true }
      }
      state.row = {
        study_reminder: true,
        announcement: true,
        message: true,
        coaching_reminder: true,
      }
      return { ok: true as const }
    },
    async updateCategory(category, enabled) {
      updateCalls.push({ category, enabled })
      if (options.failUpdate) {
        return { ok: false as const }
      }
      if (!state.row) {
        return { ok: true as const, updated: false }
      }
      state.row = { ...state.row, [category]: enabled }
      state.updatedOnce = true
      return { ok: true as const, updated: true }
    },
  }
}

function stateFrom(initial: {
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
} | null) {
  return {
    row: initial ? { ...initial } : null,
    updatedOnce: false,
  }
}

describe('buildInsertDefaultsWithCategory', () => {
  it('keeps other categories ON when turning study_reminder OFF', () => {
    expect(buildInsertDefaultsWithCategory('study_reminder', false)).toEqual({
      study_reminder: false,
      announcement: true,
      message: true,
      coaching_reminder: true,
    })
  })
})

describe('ensurePreferencesRowThenUpdateCategory', () => {
  it('creates a row from defaults then applies study_reminder OFF', async () => {
    const client = createMockClient({ initial: null })
    const result = await ensurePreferencesRowThenUpdateCategory(
      client,
      'study_reminder',
      false,
    )

    expect(result).toEqual({
      ok: true,
      preferences: {
        study_reminder: false,
        announcement: true,
        message: true,
        coaching_reminder: true,
      },
    })
    expect(client.updateCalls).toEqual([{ category: 'study_reminder', enabled: false }])
  })

  it('can change each category when no row exists', async () => {
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      const client = createMockClient({ initial: null })
      const result = await ensurePreferencesRowThenUpdateCategory(client, category, false)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.preferences[category]).toBe(false)
        for (const other of NOTIFICATION_PREFERENCE_CATEGORIES) {
          if (other !== category) expect(result.preferences[other]).toBe(true)
        }
      }
    }
  })

  it('updates only one column when a row already exists', async () => {
    const client = createMockClient({
      initial: {
        study_reminder: true,
        announcement: false,
        message: true,
        coaching_reminder: false,
      },
    })
    const insertSpy = vi.spyOn(client, 'insertDefaults')

    const result = await ensurePreferencesRowThenUpdateCategory(client, 'message', false)

    expect(insertSpy).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      preferences: {
        study_reminder: true,
        announcement: false,
        message: false,
        coaching_reminder: false,
      },
    })
    expect(client.updateCalls).toHaveLength(1)
  })

  it('does not reset concurrent values on unique conflict', async () => {
    const client = createMockClient({
      initial: null,
      concurrentCreateOnInsert: true,
    })

    const result = await ensurePreferencesRowThenUpdateCategory(
      client,
      'study_reminder',
      false,
    )

    expect(result).toEqual({
      ok: true,
      preferences: {
        study_reminder: false,
        // Preserved from the concurrent creator — not forced back to all ON
        announcement: false,
        message: true,
        coaching_reminder: true,
      },
    })
  })

  it('does not report success when insert, update, or final select fails', async () => {
    expect(
      await ensurePreferencesRowThenUpdateCategory(
        createMockClient({ initial: null, failInsert: true }),
        'study_reminder',
        false,
      ),
    ).toEqual({ ok: false, reason: 'insert_failed' })

    expect(
      await ensurePreferencesRowThenUpdateCategory(
        createMockClient({
          initial: {
            study_reminder: true,
            announcement: true,
            message: true,
            coaching_reminder: true,
          },
          failUpdate: true,
        }),
        'announcement',
        false,
      ),
    ).toEqual({ ok: false, reason: 'update_failed' })

    expect(
      await ensurePreferencesRowThenUpdateCategory(
        createMockClient({
          initial: {
            study_reminder: true,
            announcement: true,
            message: true,
            coaching_reminder: true,
          },
          failSelectAfterUpdate: true,
        }),
        'announcement',
        false,
      ),
    ).toEqual({ ok: false, reason: 'select_failed' })
  })

  it('treats zero-row updates as failure', async () => {
    const client = createMockClient({ initial: null })
    // Force update noop: insert skipped somehow by making select always null and insert conflict without creating
    client.insertDefaults = async () => ({ ok: false, conflict: true })
    client.selectPreferences = async () => ({ ok: true, row: null })

    const result = await ensurePreferencesRowThenUpdateCategory(
      client,
      'study_reminder',
      false,
    )
    expect(result).toEqual({ ok: false, reason: 'update_noop' })
  })

  it('returned preferences match the store after save', async () => {
    const client = createMockClient({ initial: null })
    const result = await ensurePreferencesRowThenUpdateCategory(
      client,
      'coaching_reminder',
      false,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.preferences).toEqual(client.row)
    }
  })
})
