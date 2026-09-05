import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClient,
  verifyRequestOrigin,
  isJsonContentType,
  inspectAdminNotificationTestTarget,
  sendAdminNotificationTestPush,
  listAdminNotificationTestTargets,
  resolveAdminNotificationTestAvailability,
  runAdminFullStudyReminderDryRun,
  runAdminCoachingReminderDryRun,
  inspectAdminStudyReminderIntegration,
  sendAdminStudyReminderIntegrationTest,
  inspectAdminCoachingBookingPromptIntegration,
  sendAdminCoachingBookingPromptIntegrationTest,
  inspectAdminCoachingSessionPreviousDayIntegration,
  sendAdminCoachingSessionPreviousDayIntegrationTest,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyRequestOrigin: vi.fn(),
  isJsonContentType: vi.fn(),
  inspectAdminNotificationTestTarget: vi.fn(),
  sendAdminNotificationTestPush: vi.fn(),
  listAdminNotificationTestTargets: vi.fn(),
  resolveAdminNotificationTestAvailability: vi.fn(),
  runAdminFullStudyReminderDryRun: vi.fn(),
  runAdminCoachingReminderDryRun: vi.fn(),
  inspectAdminStudyReminderIntegration: vi.fn(),
  sendAdminStudyReminderIntegrationTest: vi.fn(),
  inspectAdminCoachingBookingPromptIntegration: vi.fn(),
  sendAdminCoachingBookingPromptIntegrationTest: vi.fn(),
  inspectAdminCoachingSessionPreviousDayIntegration: vi.fn(),
  sendAdminCoachingSessionPreviousDayIntegrationTest: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

vi.mock('@/lib/push/origin', () => ({
  verifyRequestOrigin: (...args: unknown[]) => verifyRequestOrigin(...args),
  isJsonContentType: (...args: unknown[]) => isJsonContentType(...args),
}))

vi.mock('@/lib/admin/notification-test-service', () => ({
  inspectAdminNotificationTestTarget: (...args: unknown[]) =>
    inspectAdminNotificationTestTarget(...args),
  sendAdminNotificationTestPush: (...args: unknown[]) => sendAdminNotificationTestPush(...args),
  sendAdminNotificationTestEmail: vi.fn(),
  listAdminNotificationTestTargets: (...args: unknown[]) => listAdminNotificationTestTargets(...args),
}))

vi.mock('@/lib/admin/notification-test-full-dry-run', () => ({
  runAdminFullStudyReminderDryRun: (...args: unknown[]) => runAdminFullStudyReminderDryRun(...args),
}))

vi.mock('@/lib/admin/notification-test-coaching-dry-run', () => ({
  runAdminCoachingReminderDryRun: (...args: unknown[]) => runAdminCoachingReminderDryRun(...args),
}))

vi.mock('@/lib/admin/notification-test-announcement-dry-run', () => ({
  runAdminAnnouncementDeliveryDryRun: vi.fn(),
}))

vi.mock('@/lib/admin/notification-test-message-dry-run', () => ({
  runAdminMessageDeliveryDryRun: vi.fn(),
}))

vi.mock('@/lib/admin/notification-test-study-reminder-integration', () => ({
  inspectAdminStudyReminderIntegration: (...args: unknown[]) =>
    inspectAdminStudyReminderIntegration(...args),
  sendAdminStudyReminderIntegrationTest: (...args: unknown[]) =>
    sendAdminStudyReminderIntegrationTest(...args),
}))

vi.mock('@/lib/admin/notification-test-coaching-integration', () => ({
  inspectAdminCoachingBookingPromptIntegration: (...args: unknown[]) =>
    inspectAdminCoachingBookingPromptIntegration(...args),
  sendAdminCoachingBookingPromptIntegrationTest: (...args: unknown[]) =>
    sendAdminCoachingBookingPromptIntegrationTest(...args),
  inspectAdminCoachingSessionPreviousDayIntegration: (...args: unknown[]) =>
    inspectAdminCoachingSessionPreviousDayIntegration(...args),
  sendAdminCoachingSessionPreviousDayIntegrationTest: (...args: unknown[]) =>
    sendAdminCoachingSessionPreviousDayIntegrationTest(...args),
}))

vi.mock('@/lib/admin/notification-test-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/notification-test-config')>(
    '@/lib/admin/notification-test-config',
  )
  return {
    ...actual,
    resolveAdminNotificationTestAvailability: () => resolveAdminNotificationTestAvailability(),
  }
})

import { GET, POST } from '@/app/api/admin/notification-test/route'

function adminAuth() {
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: { role: 'admin' }, error: null }),
              }
            },
          }
        },
      }
    },
  })
}

describe('POST /api/admin/notification-test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyRequestOrigin.mockReturnValue({ ok: true })
    isJsonContentType.mockReturnValue(true)
    adminAuth()
    resolveAdminNotificationTestAvailability.mockReturnValue({
      available: true,
      allowlist: new Set(['11111111-1111-1111-1111-111111111111']),
    })
  })

  it('rejects unauthenticated callers', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects student callers', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'stu' } } }) },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { role: 'student' }, error: null }),
                }
              },
            }
          },
        }
      },
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('rejects invalid origin', async () => {
    verifyRequestOrigin.mockReturnValue({ ok: false })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('returns inspect results without leaking emails', async () => {
    inspectAdminNotificationTestTarget.mockResolvedValue({
      ok: true,
      inspect: {
        recordedToday: false,
        preferenceEnabled: true,
        preferenceRowExists: true,
        hasActivePushSubscription: true,
        canEmailFallback: true,
        pushSendingEnabled: true,
        deliveryMode: 'legacy',
        projectedOutcome: 'would_use_push',
        projectedOutcomeLabel: '現在の判定：Push対象',
      },
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inspect.projectedOutcome).toBe('would_use_push')
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('maps rate limits for push tests', async () => {
    sendAdminNotificationTestPush.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 12,
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'push',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('rate_limited')
    expect(body.retryAfterSeconds).toBe(12)
  })

  it('rejects non-json content type', async () => {
    isJsonContentType.mockReturnValue(false)
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { origin: 'https://app.example' },
        body: JSON.stringify({ action: 'full-dry-run' }),
      }),
    )
    expect(res.status).toBe(415)
  })

  it('runs full dry-run without targetUserId and without PII', async () => {
    runAdminFullStudyReminderDryRun.mockResolvedValue({
      ok: true,
      sumConsistent: { readiness: true, current: true },
      report: {
        dateKey: '2026-09-05',
        evaluatedAt: '2026-09-05T13:00:00.000Z',
        durationMs: 8,
        readiness: {
          totalStudents: 2,
          alreadyRecorded: 1,
          preferenceDisabled: 0,
          readyForPush: 1,
          emailOnly: 0,
          cannotDeliver: 0,
          failedToEvaluate: 0,
          missingStudyLog: 1,
          preferenceEnabled: 2,
          withActivePushSubscription: 1,
          withoutActivePushSubscription: 1,
          withEmail: 2,
          withoutEmail: 0,
        },
        current: {
          deliveryMode: 'legacy',
          pushSendingEnabled: false,
          legacyEmailPreferred: true,
          totalStudents: 2,
          alreadyRecorded: 1,
          preferenceDisabled: 0,
          wouldUsePush: 0,
          wouldUseEmail: 1,
          cannotDeliver: 0,
          failedToEvaluate: 0,
        },
      },
    })

    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({ action: 'full-dry-run' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.notice).toBe('evaluation_only_no_notifications_sent')
    expect(body.dryRun.readiness.readyForPush).toBe(1)
    expect(body.dryRun.current.wouldUsePush).toBe(0)
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(JSON.stringify(body)).not.toContain('@')
    expect(inspectAdminNotificationTestTarget).not.toHaveBeenCalled()
    expect(sendAdminNotificationTestPush).not.toHaveBeenCalled()
  })

  it('maps full dry-run rate limits', async () => {
    runAdminFullStudyReminderDryRun.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 45,
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({ action: 'full-dry-run' }),
      }),
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.retryAfterSeconds).toBe(45)
  })

  it('runs coaching dry-run without PII', async () => {
    runAdminCoachingReminderDryRun.mockResolvedValue({
      ok: true,
      report: {
        evaluatedAt: '2026-09-06T12:00:00.000Z',
        durationMs: 12,
        mode: 'legacy',
        pushSendingEnabled: false,
        forcedLegacyReason: null,
        bookingPrompt: {
          weekMondayKey: '2026-08-31',
          coachingEligibleUnbooked: 3,
          bookedThisWeek: 2,
          preferenceDisabled: 1,
          pushReady: 1,
          emailFallback: 1,
          cannotDeliver: 0,
          failed: 0,
        },
        sessionPreviousDay: {
          tomorrowKey: '2026-09-07',
          validBookingsTomorrow: 2,
          preferenceDisabled: 0,
          pushReady: 1,
          emailFallback: 1,
          cannotDeliver: 0,
          failed: 0,
        },
        bookingPromptCurrent: {
          preferenceDisabled: 1,
          wouldUsePush: 0,
          wouldFallbackEmail: 2,
          cannotDeliver: 0,
          failed: 0,
        },
        sessionPreviousDayCurrent: {
          preferenceDisabled: 0,
          wouldUsePush: 0,
          wouldFallbackEmail: 2,
          cannotDeliver: 0,
          failed: 0,
        },
      },
    })

    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({ action: 'coaching-dry-run' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.coachingDryRun.bookingPrompt.coachingEligibleUnbooked).toBe(3)
    expect(body.coachingDryRun.sessionPreviousDay.validBookingsTomorrow).toBe(2)
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(JSON.stringify(body)).not.toContain('@')
  })

  it('rejects invalid category for push', async () => {
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'push',
          targetUserId: '11111111-1111-1111-1111-111111111111',
          category: 'not-real',
        }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects study-reminder-send for non-admin', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'stu' } } }) },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { role: 'student' }, error: null }),
                }
              },
            }
          },
        }
      },
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'study-reminder-send',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('returns study-reminder-inspect without sending', async () => {
    inspectAdminStudyReminderIntegration.mockResolvedValue({
      ok: true,
      inspect: {
        dateKey: '2026-09-06',
        recordedToday: false,
        preferenceEnabled: true,
        preferenceRowExists: false,
        hasActivePushSubscription: true,
        canEmailFallback: true,
        pushSendingEnabled: true,
        deliveryMode: 'all',
        projectedOutcome: 'would_use_push',
        projectedOutcomeLabel: 'Push対象',
      },
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'study-reminder-inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.studyReminderInspect.projectedOutcome).toBe('would_use_push')
    expect(sendAdminStudyReminderIntegrationTest).not.toHaveBeenCalled()
  })

  it('rejects study-reminder-send for forbidden allowlist target', async () => {
    sendAdminStudyReminderIntegrationTest.mockResolvedValue({
      ok: false,
      code: 'forbidden_target',
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'study-reminder-send',
          targetUserId: '22222222-2222-2222-2222-222222222222',
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('returns safe study-reminder-send payload without secrets', async () => {
    sendAdminStudyReminderIntegrationTest.mockResolvedValue({
      ok: true,
      sent: true,
      pushSent: true,
      emailSent: false,
      skippedReason: null,
      failed: false,
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'study-reminder-send',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      sent: true,
      pushSent: true,
      emailSent: false,
      skippedReason: null,
      failed: false,
    })
    expect(JSON.stringify(body)).not.toMatch(/@|endpoint|p256dh|vapid|allowlist/i)
  })

  it('rejects coaching-booking-send for forbidden allowlist target', async () => {
    sendAdminCoachingBookingPromptIntegrationTest.mockResolvedValue({
      ok: false,
      code: 'forbidden_target',
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'coaching-booking-send',
          targetUserId: '22222222-2222-2222-2222-222222222222',
        }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('returns coaching-session-inspect without sending', async () => {
    inspectAdminCoachingSessionPreviousDayIntegration.mockResolvedValue({
      ok: true,
      inspect: {
        tomorrowKey: '2026-09-07',
        scheduledCount: 0,
        startTimes: [],
        preferenceEnabled: true,
        preferenceRowExists: false,
        hasActivePushSubscription: false,
        canEmailFallback: true,
        pushSendingEnabled: true,
        deliveryMode: 'all',
        bookings: [],
        projectedOutcome: 'no_scheduled_booking',
        projectedOutcomeLabel: '明日のscheduled予約なし',
      },
    })
    const res = await POST(
      new Request('https://app.example/api/admin/notification-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.example' },
        body: JSON.stringify({
          action: 'coaching-session-inspect',
          targetUserId: '11111111-1111-1111-1111-111111111111',
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.coachingSessionInspect.projectedOutcome).toBe('no_scheduled_booking')
    expect(sendAdminCoachingSessionPreviousDayIntegrationTest).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/notification-test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminAuth()
    resolveAdminNotificationTestAvailability.mockReturnValue({
      available: false,
      reason: 'flag_off',
    })
    listAdminNotificationTestTargets.mockResolvedValue({
      ok: true,
      targets: [],
      featureAvailable: false,
      reason: 'flag_off',
    })
  })

  it('returns a safe disabled payload', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.featureAvailable).toBe(false)
    expect(body.targets).toEqual([])
  })
})
