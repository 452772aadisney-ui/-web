import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  processCoachingReminderNewPath,
  getCoachingReminderPreferenceEnabled,
  countActivePushSubscriptions,
  ensureBookingPromptChat,
  isStudentExcludedAsGraduate,
  studentStillUnbookedThisWeek,
  loadTomorrowBookingsForStudent,
  sessionBookingStillValid,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  processCoachingReminderNewPath: vi.fn(),
  getCoachingReminderPreferenceEnabled: vi.fn(),
  countActivePushSubscriptions: vi.fn(),
  ensureBookingPromptChat: vi.fn(),
  isStudentExcludedAsGraduate: vi.fn(),
  studentStillUnbookedThisWeek: vi.fn(),
  loadTomorrowBookingsForStudent: vi.fn(),
  sessionBookingStillValid: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock('@/lib/coaching/coaching-reminder-new-path', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-reminder-new-path')
  >('@/lib/coaching/coaching-reminder-new-path')
  return {
    ...actual,
    processCoachingReminderNewPath: (...args: unknown[]) =>
      processCoachingReminderNewPath(...args),
    getCoachingReminderPreferenceEnabled: (...args: unknown[]) =>
      getCoachingReminderPreferenceEnabled(...args),
  }
})

vi.mock('@/lib/study/study-reminder-new-path', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/study/study-reminder-new-path')
  >('@/lib/study/study-reminder-new-path')
  return {
    ...actual,
    countActivePushSubscriptions: (...args: unknown[]) =>
      countActivePushSubscriptions(...args),
  }
})

vi.mock('@/lib/coaching/coaching-booking-prompt-orchestrator', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-booking-prompt-orchestrator')
  >('@/lib/coaching/coaching-booking-prompt-orchestrator')
  return {
    ...actual,
    ensureBookingPromptChat: (...args: unknown[]) => ensureBookingPromptChat(...args),
  }
})

vi.mock('@/lib/coaching/coaching-reminder-candidates', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-reminder-candidates')
  >('@/lib/coaching/coaching-reminder-candidates')
  return {
    ...actual,
    isStudentExcludedAsGraduate: (...args: unknown[]) =>
      isStudentExcludedAsGraduate(...args),
    studentStillUnbookedThisWeek: (...args: unknown[]) =>
      studentStillUnbookedThisWeek(...args),
    loadTomorrowBookingsForStudent: (...args: unknown[]) =>
      loadTomorrowBookingsForStudent(...args),
    sessionBookingStillValid: (...args: unknown[]) => sessionBookingStillValid(...args),
  }
})

vi.mock('@/lib/coaching/coaching-reminder-jst', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-reminder-jst')
  >('@/lib/coaching/coaching-reminder-jst')
  return {
    ...actual,
    getJstWeekMondayDateKey: () => '2026-09-01',
    getJstWeekDateKeys: () => [
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ],
    getJstTomorrowDateKey: () => '2026-09-07',
  }
})

import {
  buildAdminCoachingBookingPromptIntegrationIdempotencyKey,
  buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey,
} from '@/lib/admin/notification-test-config'
import { bookingPromptIdempotencyKey, sessionPreviousDayIdempotencyKey } from '@/lib/coaching/coaching-reminder-email'
import {
  inspectAdminCoachingBookingPromptIntegration,
  inspectAdminCoachingSessionPreviousDayIntegration,
  resetAdminCoachingIntegrationGateForTests,
  sendAdminCoachingBookingPromptIntegrationTest,
  sendAdminCoachingSessionPreviousDayIntegrationTest,
} from '@/lib/admin/notification-test-coaching-integration'

const STUDENT = '11111111-1111-1111-1111-111111111111'
const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BOOKING = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const STARTS = '2026-09-07T11:30:00+09:00'

function mockAllowlistedProfile(role = 'student') {
  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STUDENT, role, email: 's@example.com' },
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
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
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
}

describe('admin coaching reminder integration test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAdminCoachingIntegrationGateForTests()
    process.env.ADMIN_NOTIFICATION_TEST_ENABLED = 'true'
    process.env.NOTIFICATION_TEST_USER_IDS = STUDENT
  })

  it('uses distinct idempotency keys from Cron', () => {
    const bookingKey = buildAdminCoachingBookingPromptIntegrationIdempotencyKey({
      targetUserId: STUDENT,
      nowMs: 0,
    })
    expect(bookingKey).toBe(`admin-coaching-booking-prompt-test:${STUDENT}:0`)
    expect(bookingKey).not.toBe(bookingPromptIdempotencyKey('2026-09-01'))

    const sessionKey = buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey({
      bookingId: BOOKING,
      normalizedStartAt: STARTS,
      nowMs: 0,
    })
    expect(sessionKey.startsWith('admin-coaching-session-previous-day-test:')).toBe(true)
    expect(sessionKey).not.toBe(sessionPreviousDayIdempotencyKey(BOOKING, STARTS))
  })

  it('inspect booking does not send or create chat', async () => {
    mockAllowlistedProfile()
    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: false })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })
    getCoachingReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    countActivePushSubscriptions.mockResolvedValue({ ok: true, count: 1 })

    const result = await inspectAdminCoachingBookingPromptIntegration({
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
    expect(result.inspect.projectedOutcome).toBe('would_use_push')
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
    expect(ensureBookingPromptChat).not.toHaveBeenCalled()
  })

  it('rejects allowlist outsiders and feature flag off', async () => {
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
    const outsider = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: '22222222-2222-2222-2222-222222222222',
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(outsider).toEqual({ ok: false, code: 'forbidden_target' })

    const flagOff = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'false',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(flagOff).toEqual({ ok: false, code: 'feature_disabled' })
  })

  it('rejects non-student profiles', async () => {
    mockAllowlistedProfile('admin')
    const result = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result).toEqual({ ok: false, code: 'forbidden_target' })
  })

  it('skips booking prompt when already booked or graduate', async () => {
    mockAllowlistedProfile()
    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: true })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })

    const graduate = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(graduate.ok).toBe(true)
    if (!graduate.ok) return
    expect(graduate.skippedReason).toBe('graduate_excluded')
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()

    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: false })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: false })
    const booked = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 120_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(booked.ok).toBe(true)
    if (!booked.ok) return
    expect(booked.skippedReason).toBe('already_booked')
    expect(ensureBookingPromptChat).not.toHaveBeenCalled()
  })

  it('sends booking prompt with admin key, chat, and metadata', async () => {
    mockAllowlistedProfile()
    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: false })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })
    getCoachingReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    ensureBookingPromptChat.mockResolvedValue('created')
    processCoachingReminderNewPath.mockResolvedValue('push_sent')

    const result = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 60_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        VERCEL_ENV: 'production',
      },
    })

    expect(result).toEqual({
      ok: true,
      eligible: true,
      sent: true,
      pushSent: true,
      emailSent: false,
      chatMessageCreated: true,
      skippedReason: null,
      failed: false,
    })
    expect(processCoachingReminderNewPath).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `admin-coaching-booking-prompt-test:${STUDENT}:1`,
        kind: 'booking_prompt',
        eventMetadata: {
          source: 'admin_notification_ops',
          kind: 'coaching_booking_prompt_integration_test',
          adminUserId: ADMIN,
        },
      }),
    )
    const call = processCoachingReminderNewPath.mock.calls[0]![0] as {
      idempotencyKey: string
    }
    expect(call.idempotencyKey).not.toBe(bookingPromptIdempotencyKey('2026-09-01'))
    expect(JSON.stringify(result)).not.toMatch(/@|endpoint|p256dh|vapid/i)
  })

  it('does not proliferate chat on re-run when week duplicate is returned', async () => {
    mockAllowlistedProfile()
    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: false })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })
    getCoachingReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    ensureBookingPromptChat.mockResolvedValue('duplicate')
    processCoachingReminderNewPath.mockResolvedValue('push_sent')

    const result = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 180_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        VERCEL_ENV: 'production',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.chatMessageCreated).toBe(false)
    expect(result.pushSent).toBe(true)
    expect(ensureBookingPromptChat).toHaveBeenCalledTimes(1)
  })

  it('maps preference_disabled after chat without push/email', async () => {
    mockAllowlistedProfile()
    isStudentExcludedAsGraduate.mockResolvedValue({ ok: true, excluded: false })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })
    getCoachingReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: false })
    ensureBookingPromptChat.mockResolvedValue('created')

    const result = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.chatMessageCreated).toBe(true)
    expect(result.skippedReason).toBe('preference_disabled')
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })

  it('skips session when no scheduled booking; rejects cancelled via recheck', async () => {
    mockAllowlistedProfile()
    loadTomorrowBookingsForStudent.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      bookings: [{ bookingId: BOOKING, startsAt: STARTS, slotDate: '2026-09-07', status: 'cancelled' }],
    })

    const none = await sendAdminCoachingSessionPreviousDayIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(none.ok).toBe(true)
    if (!none.ok) return
    expect(none.skippedReason).toBe('no_scheduled_booking')

    loadTomorrowBookingsForStudent.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      bookings: [{ bookingId: BOOKING, startsAt: STARTS, slotDate: '2026-09-07', status: 'scheduled' }],
    })
    sessionBookingStillValid.mockResolvedValue({ ok: true, valid: false })

    const changed = await sendAdminCoachingSessionPreviousDayIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 120_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.skippedReason).toBe('cancelled_or_changed')
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })

  it('sends session previous-day with admin key and email fallback mapping', async () => {
    mockAllowlistedProfile()
    loadTomorrowBookingsForStudent.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      bookings: [{ bookingId: BOOKING, startsAt: STARTS, slotDate: '2026-09-07', status: 'scheduled' }],
    })
    sessionBookingStillValid.mockResolvedValue({ ok: true, valid: true })
    processCoachingReminderNewPath.mockResolvedValue('email_sent')

    const result = await sendAdminCoachingSessionPreviousDayIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 60_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        VERCEL_ENV: 'production',
      },
    })
    expect(result).toMatchObject({
      ok: true,
      sent: true,
      pushSent: false,
      emailSent: true,
      chatMessageCreated: false,
    })
    const call = processCoachingReminderNewPath.mock.calls[0]![0] as {
      idempotencyKey: string
      eventMetadata: Record<string, unknown>
    }
    expect(call.idempotencyKey).toBe(
      `admin-coaching-session-previous-day-test:${BOOKING}:${STARTS}:1`,
    )
    expect(call.idempotencyKey).not.toBe(
      sessionPreviousDayIdempotencyKey(BOOKING, STARTS),
    )
    expect(call.eventMetadata.kind).toBe(
      'coaching_session_previous_day_integration_test',
    )
  })

  it('inspect session shows times without calling send', async () => {
    mockAllowlistedProfile()
    loadTomorrowBookingsForStudent.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      bookings: [
        { bookingId: BOOKING, startsAt: STARTS, slotDate: '2026-09-07', status: 'scheduled' },
        {
          bookingId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          startsAt: '2026-09-07T15:00:00+09:00',
          slotDate: '2026-09-07',
          status: 'cancelled',
        },
      ],
    })
    getCoachingReminderPreferenceEnabled.mockResolvedValue({ ok: true, enabled: true })
    countActivePushSubscriptions.mockResolvedValue({ ok: true, count: 0 })

    const result = await inspectAdminCoachingSessionPreviousDayIntegration({
      targetUserId: STUDENT,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
        PUSH_SENDING_ENABLED: 'false',
        VERCEL_ENV: 'production',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inspect.scheduledCount).toBe(1)
    expect(result.inspect.bookings).toHaveLength(2)
    expect(JSON.stringify(result.inspect)).not.toContain(BOOKING)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })

  it('rate-limits booking prompt when admin bucket event exists', async () => {
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
                    maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(table)
      },
    })

    const result = await sendAdminCoachingBookingPromptIntegrationTest({
      adminUserId: ADMIN,
      targetUserId: STUDENT,
      nowMs: 90_000,
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: STUDENT,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('rate_limited')
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })
})
