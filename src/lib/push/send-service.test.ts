import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendNotification, setVapidDetails, createAdminClient, resolvePushSendConfigMock } =
  vi.hoisted(() => ({
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    createAdminClient: vi.fn(),
    resolvePushSendConfigMock: vi.fn(),
  }))

vi.mock('web-push', () => ({
  default: {
    sendNotification,
    setVapidDetails,
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

vi.mock('@/lib/push/send-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push/send-config')>(
    '@/lib/push/send-config',
  )
  return {
    ...actual,
    resolvePushSendConfig: resolvePushSendConfigMock,
  }
})

import { sendPushNotification } from '@/lib/push/send-service'

type Sub = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

function mockAdmin(options: {
  prefs?: Record<string, boolean> | null
  subscriptions?: Sub[]
  existingEventId?: string | null
  existingDeliveryStatus?: 'pending' | 'sent' | 'failed' | 'skipped' | null
}) {
  const deliveries: Array<Record<string, unknown>> = []
  const subscriptionUpdates: Array<Record<string, unknown>> = []

  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: options.prefs === undefined ? null : options.prefs,
                    error: null,
                  }),
                }
              },
            }
          },
        }
      }

      if (table === 'push_subscriptions') {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.is = () => chain
        chain.in = () => chain
        chain.limit = async () => ({ data: options.subscriptions ?? [], error: null })
        chain.then = (
          onfulfilled?: (value: { data: Sub[]; error: null }) => unknown,
          onrejected?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({ data: options.subscriptions ?? [], error: null }).then(
            onfulfilled,
            onrejected,
          )
        chain.update = (payload: Record<string, unknown>) => {
          subscriptionUpdates.push(payload)
          const updateChain: Record<string, unknown> = {}
          updateChain.eq = () => updateChain
          updateChain.then = (
            onfulfilled?: (value: { error: null }) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) => Promise.resolve({ error: null }).then(onfulfilled, onrejected)
          return updateChain
        }
        return chain
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
                          maybeSingle: async () => ({
                            data: options.existingEventId
                              ? { id: options.existingEventId }
                              : null,
                            error: null,
                          }),
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
        }
      }

      if (table === 'notification_deliveries') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: options.existingDeliveryStatus
                          ? { status: options.existingDeliveryStatus }
                          : null,
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
          insert(payload: Record<string, unknown>) {
            deliveries.push(payload)
            return Promise.resolve({ error: null })
          },
          update(payload: Record<string, unknown>) {
            deliveries.push(payload)
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.select = () => chain
            chain.maybeSingle = async () => ({ data: { id: 'delivery-1' }, error: null })
            return chain
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  })

  return { deliveries, subscriptionUpdates }
}

describe('sendPushNotification', () => {
  beforeEach(() => {
    sendNotification.mockReset()
    setVapidDetails.mockReset()
    createAdminClient.mockReset()
    resolvePushSendConfigMock.mockReturnValue({
      ok: true,
      publicKey: 'BKpublicKeyValueThatIsLongEnough1234567890',
      privateKey: 'privateKeyValueThatIsLongEnough1234567890',
      subject: 'mailto:ops@example.com',
    })
  })

  it('returns disabled without writing when config is off', async () => {
    resolvePushSendConfigMock.mockReturnValue({ ok: false, reason: 'disabled' })
    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'test',
      idempotencyKey: 'k1',
      title: '受験生web',
      body: '通知を受け取れる状態です。',
      targetPath: '/dashboard/notifications',
    })
    expect(result).toEqual({ ok: false, code: 'disabled' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('sends test notifications without checking category preferences', async () => {
    mockAdmin({
      prefs: {
        study_reminder: false,
        announcement: false,
        message: false,
        coaching_reminder: false,
      },
      subscriptions: [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
          auth: 'authKeyValue12',
          failure_count: 0,
        },
      ],
    })
    sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} })

    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'test',
      idempotencyKey: 'k-test',
      title: '受験生web',
      body: '通知を受け取れる状態です。',
      targetPath: '/dashboard/notifications',
      subscriptionIds: ['sub-1'],
    })

    expect(result).toMatchObject({ ok: true, sent: 1, failed: 0 })
    expect(sendNotification).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string) as {
      targetPath: string
    }
    expect(payload.targetPath).toBe('/dashboard/notifications')
    expect(JSON.stringify(result)).not.toContain('fcm.googleapis.com')
  })

  it('skips already-sent deliveries on the same event', async () => {
    mockAdmin({
      subscriptions: [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
          auth: 'authKeyValue12',
          failure_count: 0,
        },
      ],
      existingEventId: 'event-existing',
      existingDeliveryStatus: 'sent',
    })

    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'test',
      idempotencyKey: 'k-dup',
      title: '受験生web',
      body: '通知を受け取れる状態です。',
      targetPath: '/dashboard/notifications',
    })

    expect(result).toMatchObject({ ok: true, sent: 0, skipped: 1, eventCreated: false })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('disables subscriptions on 410 and continues', async () => {
    const { subscriptionUpdates } = mockAdmin({
      subscriptions: [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
          auth: 'authKeyValue12',
          failure_count: 2,
        },
      ],
    })
    sendNotification.mockRejectedValue({ statusCode: 410, body: 'Gone' })

    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'test',
      idempotencyKey: 'k-gone',
      title: '受験生web',
      body: '通知を受け取れる状態です。',
      targetPath: '/dashboard/notifications',
    })

    expect(result).toMatchObject({ ok: true, sent: 0, failed: 1 })
    expect(subscriptionUpdates.some((u) => 'disabled_at' in u)).toBe(true)
  })

  it('does not disable on 429', async () => {
    const { subscriptionUpdates } = mockAdmin({
      subscriptions: [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
          auth: 'authKeyValue12',
          failure_count: 0,
        },
      ],
    })
    sendNotification.mockRejectedValue({ statusCode: 429, body: 'slow down' })

    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'test',
      idempotencyKey: 'k-429',
      title: '受験生web',
      body: '通知を受け取れる状態です。',
      targetPath: '/dashboard/notifications',
    })

    expect(result).toMatchObject({ ok: true, failed: 1 })
    expect(subscriptionUpdates.some((u) => 'disabled_at' in u)).toBe(false)
    expect(subscriptionUpdates.some((u) => u.failure_count === 1)).toBe(true)
  })

  it('respects category preferences for non-test types', async () => {
    mockAdmin({
      prefs: {
        study_reminder: false,
        announcement: true,
        message: true,
        coaching_reminder: true,
      },
      subscriptions: [
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
          p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
          auth: 'authKeyValue12',
          failure_count: 0,
        },
      ],
    })

    const result = await sendPushNotification({
      userId: 'u1',
      notificationType: 'study_reminder',
      idempotencyKey: 'k-pref',
      title: '学習リマインダー',
      body: '今日の学習記録がまだありません',
      targetPath: '/dashboard/study',
    })

    expect(result).toEqual({ ok: false, code: 'preference_disabled' })
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
