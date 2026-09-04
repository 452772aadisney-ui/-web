import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

import {
  disablePushSubscriptionForUser,
  upsertPushSubscriptionForUser,
} from '@/lib/push/subscription-service'

type Row = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  disabled_at: string | null
}

function thenableResult<T>(value: T) {
  return {
    then(onfulfilled?: (value: T) => unknown, onrejected?: (reason: unknown) => unknown) {
      return Promise.resolve(value).then(onfulfilled, onrejected)
    },
  }
}

function mockAdmin(options: {
  existing?: Row | null
  prefsExists?: boolean
  insertError?: { code: string } | null
  updateError?: unknown
  onInsert?: (payload: Record<string, unknown>) => void
  onUpdate?: (payload: Record<string, unknown>) => void
  onPrefsInsert?: (payload: Record<string, unknown>) => void
}) {
  const state = {
    existing: options.existing ?? null,
    prefsExists: options.prefsExists ?? false,
  }

  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'push_subscriptions') {
        const selectBuilder = {
          eq() {
            return selectBuilder
          },
          maybeSingle: async () => ({ data: state.existing, error: null }),
        }

        const updateBuilder = {
          eq() {
            return updateBuilder
          },
          then(
            onfulfilled?: (value: { error: unknown }) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({ error: options.updateError ?? null }).then(
              onfulfilled,
              onrejected,
            )
          },
        }

        return {
          select() {
            return selectBuilder
          },
          insert(payload: Record<string, unknown>) {
            options.onInsert?.(payload)
            return thenableResult({ error: options.insertError ?? null })
          },
          update(payload: Record<string, unknown>) {
            options.onUpdate?.(payload)
            return updateBuilder
          },
        }
      }

      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: state.prefsExists ? { user_id: 'u1' } : null,
                    error: null,
                  }),
                }
              },
            }
          },
          insert(payload: Record<string, unknown>) {
            options.onPrefsInsert?.(payload)
            state.prefsExists = true
            return thenableResult({ error: null })
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  })
}

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: null as number | null,
  keys: {
    p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
    auth: 'authKeyValue12',
  },
}

describe('upsertPushSubscriptionForUser', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
  })

  it('inserts for a new endpoint and creates default preferences once', async () => {
    const inserts: Record<string, unknown>[] = []
    const prefs: Record<string, unknown>[] = []
    mockAdmin({
      existing: null,
      onInsert: (p) => inserts.push(p),
      onPrefsInsert: (p) => prefs.push(p),
    })

    const result = await upsertPushSubscriptionForUser({
      userId: 'student-1',
      subscription,
      userAgent: 'TestAgent',
    })

    expect(result).toEqual({ ok: true })
    expect(inserts[0]).toMatchObject({
      user_id: 'student-1',
      endpoint: subscription.endpoint,
      failure_count: 0,
      disabled_at: null,
    })
    expect(prefs[0]).toMatchObject({
      user_id: 'student-1',
      study_reminder: true,
      announcement: true,
      message: true,
      coaching_reminder: true,
    })
    expect(JSON.stringify(result)).not.toContain('fcm.googleapis.com')
  })

  it('does not overwrite existing preferences', async () => {
    const prefs: Record<string, unknown>[] = []
    mockAdmin({
      existing: {
        id: 'sub-1',
        user_id: 'student-1',
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        disabled_at: null,
      },
      prefsExists: true,
      onPrefsInsert: (p) => prefs.push(p),
    })

    const result = await upsertPushSubscriptionForUser({
      userId: 'student-1',
      subscription,
      userAgent: null,
    })

    expect(result).toEqual({ ok: true })
    expect(prefs).toHaveLength(0)
  })

  it('rejects transfer when endpoint matches but keys differ', async () => {
    mockAdmin({
      existing: {
        id: 'sub-1',
        user_id: 'other-user',
        endpoint: subscription.endpoint,
        p256dh: 'OTHER_KEY_VALUE_THAT_IS_LONG_ENOUGH_XX',
        auth: 'otherAuthKey99',
        disabled_at: null,
      },
    })

    const result = await upsertPushSubscriptionForUser({
      userId: 'student-1',
      subscription,
      userAgent: null,
    })

    expect(result).toEqual({ ok: false, code: 'conflict' })
  })

  it('transfers when endpoint and both keys match', async () => {
    const updates: Record<string, unknown>[] = []
    mockAdmin({
      existing: {
        id: 'sub-1',
        user_id: 'other-user',
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        disabled_at: null,
      },
      onUpdate: (p) => updates.push(p),
    })

    const result = await upsertPushSubscriptionForUser({
      userId: 'student-1',
      subscription,
      userAgent: 'UA',
    })

    expect(result).toEqual({ ok: true, transferred: true })
    expect(updates[0]).toMatchObject({ user_id: 'student-1', disabled_at: null })
  })
})

describe('disablePushSubscriptionForUser', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
  })

  it('treats other-user rows as success without disabling', async () => {
    const updates: Record<string, unknown>[] = []
    mockAdmin({
      existing: {
        id: 'sub-1',
        user_id: 'other-user',
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        disabled_at: null,
      },
      onUpdate: (p) => updates.push(p),
    })

    const result = await disablePushSubscriptionForUser({
      userId: 'student-1',
      subscription,
    })

    expect(result).toEqual({ ok: true })
    expect(updates).toHaveLength(0)
  })

  it('soft-disables the current user subscription', async () => {
    const updates: Record<string, unknown>[] = []
    mockAdmin({
      existing: {
        id: 'sub-1',
        user_id: 'student-1',
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        disabled_at: null,
      },
      onUpdate: (p) => updates.push(p),
    })

    const result = await disablePushSubscriptionForUser({
      userId: 'student-1',
      subscription,
    })

    expect(result).toEqual({ ok: true })
    expect(updates[0]).toHaveProperty('disabled_at')
  })
})
