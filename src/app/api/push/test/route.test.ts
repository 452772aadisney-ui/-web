import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClient,
  verifyRequestOrigin,
  isJsonContentType,
  parsePushSubscriptionInput,
  readJsonBodyLimited,
  isPushSendingAvailable,
  findActiveSubscriptionForUserKeys,
  getLatestTestNotificationAt,
  sendPushNotification,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyRequestOrigin: vi.fn(),
  isJsonContentType: vi.fn(),
  parsePushSubscriptionInput: vi.fn(),
  readJsonBodyLimited: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  findActiveSubscriptionForUserKeys: vi.fn(),
  getLatestTestNotificationAt: vi.fn(),
  sendPushNotification: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

vi.mock('@/lib/push/origin', () => ({
  verifyRequestOrigin: (...args: unknown[]) => verifyRequestOrigin(...args),
  isJsonContentType: (...args: unknown[]) => isJsonContentType(...args),
}))

vi.mock('@/lib/push/subscription-input', () => ({
  parsePushSubscriptionInput: (...args: unknown[]) => parsePushSubscriptionInput(...args),
  readJsonBodyLimited: (...args: unknown[]) => readJsonBodyLimited(...args),
}))

vi.mock('@/lib/push/send-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push/send-config')>(
    '@/lib/push/send-config',
  )
  return {
    ...actual,
    isPushSendingAvailable: () => isPushSendingAvailable(),
  }
})

vi.mock('@/lib/push/send-service', () => ({
  findActiveSubscriptionForUserKeys: (...args: unknown[]) =>
    findActiveSubscriptionForUserKeys(...args),
  getLatestTestNotificationAt: (...args: unknown[]) => getLatestTestNotificationAt(...args),
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}))

import { POST } from '@/app/api/push/test/route'

function studentAuth() {
  createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
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
}

function adminAuth() {
  createClient.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1' } } }),
    },
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

describe('POST /api/push/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyRequestOrigin.mockReturnValue({ ok: true })
    isJsonContentType.mockReturnValue(true)
    isPushSendingAvailable.mockReturnValue(true)
    readJsonBodyLimited.mockResolvedValue({
      ok: true,
      value: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256', auth: 'auth' },
      },
    })
    parsePushSubscriptionInput.mockReturnValue({
      ok: true,
      value: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256', auth: 'auth' },
      },
    })
    getLatestTestNotificationAt.mockResolvedValue({ ok: true, createdAt: null })
    findActiveSubscriptionForUserKeys.mockResolvedValue({
      ok: true,
      subscriptionId: 'sub-1',
    })
    sendPushNotification.mockResolvedValue({
      ok: true,
      eventCreated: true,
      eventId: 'ev-1',
      sent: 1,
      failed: 0,
      skipped: 0,
    })
    studentAuth()
  })

  it('rejects unauthenticated users', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    })
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('rejects admin callers', async () => {
    adminAuth()
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('rejects invalid origin', async () => {
    verifyRequestOrigin.mockReturnValue({ ok: false })
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(403)
  })

  it('rejects non-json content type', async () => {
    isJsonContentType.mockReturnValue(false)
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(415)
  })

  it('returns 503 when sending is unavailable without creating sends', async () => {
    isPushSendingAvailable.mockReturnValue(false)
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('sending_unavailable')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('rate limits recent test events', async () => {
    getLatestTestNotificationAt.mockResolvedValue({
      ok: true,
      createdAt: new Date().toISOString(),
    })
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('rate_limited')
    expect(typeof body.retryAfterSeconds).toBe('number')
    expect(JSON.stringify(body)).not.toContain('fcm.googleapis.com')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('rejects when subscription keys do not match an active owned sub', async () => {
    findActiveSubscriptionForUserKeys.mockResolvedValue({ ok: false, code: 'not_found' })
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(404)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('sends only to the matched subscription with server-fixed copy', async () => {
    const res = await POST(new Request('https://app.example/api/push/test', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        notificationType: 'test',
        title: '受験生web',
        body: '通知を受け取れる状態です。',
        targetPath: '/dashboard/notifications',
        subscriptionIds: ['sub-1'],
      }),
    )
    const body = await res.json()
    expect(body).toEqual({ ok: true, sent: 1 })
    expect(JSON.stringify(body)).not.toContain('p256')
  })
})
