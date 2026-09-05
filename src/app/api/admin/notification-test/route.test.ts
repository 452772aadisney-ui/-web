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
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyRequestOrigin: vi.fn(),
  isJsonContentType: vi.fn(),
  inspectAdminNotificationTestTarget: vi.fn(),
  sendAdminNotificationTestPush: vi.fn(),
  listAdminNotificationTestTargets: vi.fn(),
  resolveAdminNotificationTestAvailability: vi.fn(),
  runAdminFullStudyReminderDryRun: vi.fn(),
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
      sumConsistent: true,
      aggregate: {
        dateKey: '2026-09-05',
        evaluatedAt: '2026-09-05T13:00:00.000Z',
        durationMs: 8,
        deliveryMode: 'legacy',
        pushSendingEnabled: false,
        totalStudents: 2,
        alreadyRecorded: 1,
        preferenceDisabled: 0,
        wouldUsePushFirst: 0,
        wouldFallbackToEmail: 1,
        cannotDeliver: 0,
        failedToEvaluate: 0,
        missingStudyLog: 1,
        preferenceEnabled: 2,
        withActivePushSubscription: 0,
        withoutActivePushSubscription: 2,
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
    expect(body.dryRun.totalStudents).toBe(2)
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
