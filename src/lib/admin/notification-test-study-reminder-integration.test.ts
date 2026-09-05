import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  processStudyReminderNewPath,
  hasStudyLogOnDate,
  getStudyReminderPreferenceEnabled,
  countActivePushSubscriptions,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  processStudyReminderNewPath: vi.fn(),
  hasStudyLogOnDate: vi.fn(),
  getStudyReminderPreferenceEnabled: vi.fn(),
  countActivePushSubscriptions: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock('@/lib/study/study-reminder-new-path', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/study/study-reminder-new-path')
  >('@/lib/study/study-reminder-new-path')
  return {
    ...actual,
    processStudyReminderNewPath: (...args: unknown[]) => processStudyReminderNewPath(...args),
    hasStudyLogOnDate: (...args: unknown[]) => hasStudyLogOnDate(...args),
    getStudyReminderPreferenceEnabled: (...args: unknown[]) =>
      getStudyReminderPreferenceEnabled(...args),
    countActivePushSubscriptions: (...args: unknown[]) =>
      countActivePushSubscriptions(...args),
  }
})

vi.mock('@/lib/study/dates', () => ({
  getJstDateKey: () => '2026-09-06',
}))

import {
  buildAdminStudyReminderIntegrationIdempotencyKey,
} from '@/lib/admin/notification-test-config'
import {
  inspectAdminStudyReminderIntegration,
  resetAdminStudyReminderIntegrationGateForTests,
  sendAdminStudyReminderIntegrationTest,
} from '@/lib/admin/notification-test-study-reminder-integration'

const STUDENT = '11111111-1111-1111-1111-111111111111'
const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('admin study reminder integration test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAdminStudyReminderIntegrationGateForTests()
    process.env.ADMIN_NOTIFICATION_TEST_ENABLED = 'true'
    process.env.NOTIFICATION_TEST_USER_IDS = STUDENT
  })

  it('uses distinct idempotency key from JST daily cron key', () => {
    const key = buildAdminStudyReminderIntegrationIdempotencyKey({
      targetUserId: STUDENT,
      nowMs: 0,
    })
    expect(key).toBe(`admin-study-reminder-test:${STUDENT}:0`)
    expect(key).not.toBe('2026-09-06')
    expect(key.startsWith('admin-study-reminder-test:')).toBe(true)
  })

  it('inspect does not call send path', async () => {
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STUDENT, role: 'student', email: 's@example.com' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'notification_preferences') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }
        }
        throw new Error(table)
      },
    })
    hasStudyLogOnDate.mockResolvedValue({ ok: true, hasLog: false })
    getStudyReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    countActivePushSubscriptions.mockResolvedValue({ ok: true, count: 1 })

    const result = await inspectAdminStudyReminderIntegration({
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        PUSH_SENDING_ENABLED: 'true',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pkpkpkpkpkpkpkpkpkpk',
        VAPID_PRIVATE_KEY: 'sksksksksksksksksksk',
        VAPID_SUBJECT: 'mailto:a@b.co',
        VERCEL_ENV: 'production',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inspect.dateKey).toBe('2026-09-06')
    expect(result.inspect.projectedOutcome).toBe('would_use_push')
    expect(processStudyReminderNewPath).not.toHaveBeenCalled()
  })

  it('rejects allowlist outsiders', async () => {
    createAdminClient.mockReturnValue({
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '22222222-2222-2222-2222-222222222222', role: 'student' },
                error: null,
              }),
            }),
          }),
        }
      },
    })
    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: '22222222-2222-2222-2222-222222222222',
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result).toEqual({ ok: false, code: 'forbidden_target' })
    expect(processStudyReminderNewPath).not.toHaveBeenCalled()
  })

  it('rejects feature flag off', async () => {
    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'false',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result).toEqual({ ok: false, code: 'feature_disabled' })
  })

  it('sends via processStudyReminderNewPath with admin key and metadata', async () => {
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  // role check then email
                  return {
                    data: { id: STUDENT, role: 'student', email: 's@example.com' },
                    error: null,
                  }
                },
              }),
            }),
          }
        }
        if (table === 'notification_events') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(table)
      },
    })
    processStudyReminderNewPath.mockResolvedValue('push_sent')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 30_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        VERCEL_ENV: 'production',
      },
    })

    expect(result).toEqual({
      ok: true,
      sent: true,
      pushSent: true,
      emailSent: false,
      skippedReason: null,
      failed: false,
    })
    expect(processStudyReminderNewPath).toHaveBeenCalledWith(
      expect.objectContaining({
        dateKey: '2026-09-06',
        idempotencyKey: `admin-study-reminder-test:${STUDENT}:1`,
        eventMetadata: {
          source: 'admin_notification_ops',
          kind: 'study_reminder_integration_test',
          adminUserId: ADMIN,
        },
      }),
    )
    const call = processStudyReminderNewPath.mock.calls[0][0] as {
      idempotencyKey: string
    }
    expect(call.idempotencyKey).not.toBe('2026-09-06')
  })

  function mockAllowlistedStudentClient(opts?: { existingEventId?: string | null }) {
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STUDENT, role: 'student', email: 's@example.com' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'notification_events') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: opts?.existingEventId ? { id: opts.existingEventId } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(table)
      },
    })
  }

  it('maps recorded_before_send without failing', async () => {
    mockAllowlistedStudentClient()
    processStudyReminderNewPath.mockResolvedValue('recorded_before_send')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sent).toBe(false)
    expect(result.skippedReason).toBe('already_recorded')
  })

  it('rejects non-student profiles', async () => {
    createAdminClient.mockReturnValue({
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STUDENT, role: 'admin' },
                error: null,
              }),
            }),
          }),
        }
      },
    })
    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result).toEqual({ ok: false, code: 'forbidden_target' })
    expect(processStudyReminderNewPath).not.toHaveBeenCalled()
  })

  it('maps preference_disabled without sending', async () => {
    mockAllowlistedStudentClient()
    processStudyReminderNewPath.mockResolvedValue('preference_disabled')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).toMatchObject({
      sent: false,
      pushSent: false,
      emailSent: false,
      skippedReason: 'preference_disabled',
      failed: false,
    })
  })

  it('maps email_sent when push unavailable/fallback', async () => {
    mockAllowlistedStudentClient()
    processStudyReminderNewPath.mockResolvedValue('email_sent')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result).toEqual({
      ok: true,
      sent: true,
      pushSent: false,
      emailSent: true,
      skippedReason: null,
      failed: false,
    })
    expect(JSON.stringify(result)).not.toMatch(/@|endpoint|p256dh|auth|vapid/i)
  })

  it('maps undeliverable safely when email unavailable', async () => {
    mockAllowlistedStudentClient()
    processStudyReminderNewPath.mockResolvedValue('undeliverable')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skippedReason).toBe('undeliverable')
    expect(result.sent).toBe(false)
  })

  it('rate-limits when admin bucket event already exists', async () => {
    mockAllowlistedStudentClient({ existingEventId: 'evt-1' })

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 45_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('rate_limited')
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(processStudyReminderNewPath).not.toHaveBeenCalled()
  })

  it('inspect projects preference_disabled and does not send', async () => {
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STUDENT, role: 'student', email: 's@example.com' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'notification_preferences') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { user_id: STUDENT }, error: null }),
              }),
            }),
          }
        }
        throw new Error(table)
      },
    })
    hasStudyLogOnDate.mockResolvedValue({ ok: true, hasLog: false })
    getStudyReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: false })
    countActivePushSubscriptions.mockResolvedValue({ ok: true, count: 0 })

    const result = await inspectAdminStudyReminderIntegration({
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        PUSH_SENDING_ENABLED: 'true',
        VERCEL_ENV: 'production',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inspect.projectedOutcome).toBe('preference_disabled')
    expect(result.inspect.projectedOutcomeLabel).toBe('管理者により停止')
    expect(processStudyReminderNewPath).not.toHaveBeenCalled()
  })
})
