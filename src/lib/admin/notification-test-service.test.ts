import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  sendPushNotification,
  isPushSendingAvailable,
  sendEmail,
  hasStudyLogOnDate,
  getStudyReminderPreferenceEnabled,
  countActivePushSubscriptions,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendPushNotification: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  sendEmail: vi.fn(),
  hasStudyLogOnDate: vi.fn(),
  getStudyReminderPreferenceEnabled: vi.fn(),
  countActivePushSubscriptions: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

vi.mock('@/lib/push/send-service', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}))

vi.mock('@/lib/push/send-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push/send-config')>(
    '@/lib/push/send-config',
  )
  return {
    ...actual,
    isPushSendingAvailable: (...args: unknown[]) => isPushSendingAvailable(...args),
  }
})

vi.mock('@/lib/email/send', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))

vi.mock('@/lib/study/study-reminder-new-path', async () => {
  const actual = await vi.importActual<typeof import('@/lib/study/study-reminder-new-path')>(
    '@/lib/study/study-reminder-new-path',
  )
  return {
    ...actual,
    hasStudyLogOnDate: (...args: unknown[]) => hasStudyLogOnDate(...args),
    getStudyReminderPreferenceEnabled: (...args: unknown[]) =>
      getStudyReminderPreferenceEnabled(...args),
    countActivePushSubscriptions: (...args: unknown[]) => countActivePushSubscriptions(...args),
  }
})

import {
  inspectAdminNotificationTestTarget,
  sendAdminNotificationTestEmail,
  sendAdminNotificationTestPush,
} from '@/lib/admin/notification-test-service'

const ALLOWED = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function enableFeature() {
  process.env.ADMIN_NOTIFICATION_TEST_ENABLED = 'true'
  process.env.NOTIFICATION_TEST_USER_IDS = ALLOWED
}

function mockProfileLookup(role: 'student' | 'admin', id: string) {
  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id, role, email: 't@example.com' },
                    error: null,
                  }),
                  in: () =>
                    Promise.resolve({
                      data: [{ id, full_name: 'テスト生徒', display_name: null, role }],
                      error: null,
                    }),
                }
              },
              in: () =>
                Promise.resolve({
                  data: [{ id, full_name: 'テスト生徒', display_name: null, role }],
                  error: null,
                }),
            }
          },
        }
      }
      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { user_id: id }, error: null }),
                }
              },
            }
          },
        }
      }
      if (table === 'notification_events') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          maybeSingle: async () => ({ data: null, error: null }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'event-1' }, error: null }),
                }
              },
            }
          },
          update() {
            return {
              eq: () => Promise.resolve({ error: null }),
            }
          },
        }
      }
      if (table === 'notification_deliveries') {
        return {
          insert: () => Promise.resolve({ error: null }),
          update() {
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.then = (
              onfulfilled?: (value: { error: null }) => unknown,
              onrejected?: (reason: unknown) => unknown,
            ) => Promise.resolve({ error: null }).then(onfulfilled, onrejected)
            return chain
          },
        }
      }
      throw new Error(table)
    },
  })
}

describe('admin notification test service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_NOTIFICATION_TEST_ENABLED
    delete process.env.NOTIFICATION_TEST_USER_IDS
    isPushSendingAvailable.mockReturnValue(true)
  })

  it('rejects targets outside the allowlist', async () => {
    enableFeature()
    mockProfileLookup('student', OTHER)
    const result = await inspectAdminNotificationTestTarget({ targetUserId: OTHER })
    expect(result).toEqual({ ok: false, code: 'forbidden_target' })
    expect(hasStudyLogOnDate).not.toHaveBeenCalled()
  })

  it('inspects without sending push or email', async () => {
    enableFeature()
    mockProfileLookup('student', ALLOWED)
    hasStudyLogOnDate.mockResolvedValue({ ok: true, hasLog: false })
    getStudyReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    countActivePushSubscriptions.mockResolvedValue({ ok: true, count: 1 })

    const result = await inspectAdminNotificationTestTarget({ targetUserId: ALLOWED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inspect.projectedOutcome).toBe('would_use_push')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('t@example.com')
  })

  it('sends push only for allowlisted students with type=test', async () => {
    enableFeature()
    mockProfileLookup('student', ALLOWED)
    sendPushNotification.mockResolvedValue({
      ok: true,
      eventCreated: true,
      eventId: 'ev',
      sent: 1,
      failed: 0,
      skipped: 0,
    })

    const result = await sendAdminNotificationTestPush({
      adminUserId: 'admin-1',
      targetUserId: ALLOWED,
      nowMs: 1_000_000,
    })
    expect(result).toMatchObject({ ok: true, sent: 1 })
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ALLOWED,
        notificationType: 'test',
        title: '受験生web',
        body: '学習記録リマインダーのテスト通知です。',
        targetPath: '/dashboard/study',
      }),
    )
    const key = (sendPushNotification.mock.calls[0][0] as { idempotencyKey: string })
      .idempotencyKey
    expect(key).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses paced email sends and never fans out to all students', async () => {
    enableFeature()
    mockProfileLookup('student', ALLOWED)
    sendEmail.mockResolvedValue({ ok: true, httpStatus: 200 })

    const result = await sendAdminNotificationTestEmail({
      adminUserId: 'admin-1',
      targetUserId: ALLOWED,
      nowMs: 2_000_000,
    })
    expect(result).toEqual({ ok: true })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        pace: true,
        omitRecipientFromLogs: true,
        subject: expect.stringContaining('テスト'),
      }),
    )
  })

  it('blocks send when feature flag is off', async () => {
    process.env.ADMIN_NOTIFICATION_TEST_ENABLED = 'false'
    process.env.NOTIFICATION_TEST_USER_IDS = ALLOWED
    const result = await sendAdminNotificationTestPush({
      adminUserId: 'admin-1',
      targetUserId: ALLOWED,
    })
    expect(result).toEqual({ ok: false, code: 'feature_disabled' })
    expect(sendPushNotification).not.toHaveBeenCalled()
  })
})
