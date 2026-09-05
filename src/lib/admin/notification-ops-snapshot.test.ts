import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock('@/lib/push/send-config', () => ({
  isPushSendingAvailable: () => false,
}))

import { loadNotificationOpsSnapshot } from '@/lib/admin/notification-ops-snapshot'

describe('loadNotificationOpsSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails closed when admin client missing', async () => {
    createAdminClient.mockReturnValue(null)
    const result = await loadNotificationOpsSnapshot({
      env: { PUSH_SENDING_ENABLED: 'false' },
    })
    expect(result).toEqual({ ok: false, code: 'admin_unavailable' })
  })

  it('returns env/mode/cron cards without PII when queries fail partially', async () => {
    createAdminClient.mockReturnValue({
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  limit: async () => ({ data: null, error: { message: 'x' } }),
                  is: () => ({
                    limit: async () => ({ data: null, error: { message: 'x' } }),
                  }),
                  not: () => ({
                    // disabled count
                  }),
                }
              },
              is: () => ({
                limit: async () => ({ data: null, error: { message: 'x' } }),
              }),
              not: () => ({
                // for count head
              }),
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: null, error: { message: 'x' } }),
                }),
              }),
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'x' } }),
              }),
            }
          },
        }
      },
    })

    const result = await loadNotificationOpsSnapshot({
      env: {
        PUSH_SENDING_ENABLED: 'false',
        STUDY_REMINDER_DELIVERY_MODE: 'not-a-mode',
        ANNOUNCEMENT_DELIVERY_MODE: 'legacy',
        MESSAGE_DELIVERY_MODE: 'allowlist',
        MESSAGE_PUSH_ALLOWLIST: '',
        COACHING_REMINDER_DELIVERY_MODE: 'all',
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        CRON_SECRET: 'present',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pk',
        VAPID_PRIVATE_KEY: 'sk',
        VAPID_SUBJECT: 'mailto:a@example.com',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const json = JSON.stringify(result.snapshot)
    expect(json).not.toContain('@example.com')
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(result.snapshot.env.cronSecret).toBe('configured')
    expect(result.snapshot.env.vapidPrivateKey).toBe('configured')
    expect(result.snapshot.modes.find((m) => m.id === 'study_reminder')?.warning).toContain(
      'legacy',
    )
    expect(result.snapshot.modes.find((m) => m.id === 'message')?.forcedLegacyReason).toBe(
      'allowlist_empty',
    )
    expect(result.snapshot.crons).toHaveLength(4)
    expect(result.snapshot.subscriptionsError).toBe(true)
  })
})
