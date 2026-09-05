import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  sendPushNotification,
  isPushSendingAvailable,
  sendStudentMessageEmail,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendPushNotification: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  sendStudentMessageEmail: vi.fn(),
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

vi.mock('@/lib/chat/message-email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/message-email')>(
    '@/lib/chat/message-email',
  )
  return {
    ...actual,
    sendStudentMessageEmail: (...args: unknown[]) => sendStudentMessageEmail(...args),
  }
})

import { processMessageNewPath } from '@/lib/chat/message-new-path'
import {
  MESSAGE_PUSH_BODY,
  MESSAGE_PUSH_PATH,
  MESSAGE_PUSH_TAG,
  MESSAGE_PUSH_TITLE,
  messageIdempotencyKey,
} from '@/lib/chat/message-email'

function mockAdmin(options: {
  pref?: { message: boolean } | null | 'error'
  eventId?: string | null
  deliveries?: Array<{
    id: string
    channel: 'push' | 'email'
    status: 'pending' | 'sent' | 'failed' | 'skipped'
    sent_at: string | null
    created_at: string
  }>
  emailInsertCode?: string | null
}) {
  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    if (options.pref === 'error') {
                      return { data: null, error: { message: 'fail' } }
                    }
                    return { data: options.pref ?? null, error: null }
                  },
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
                          maybeSingle: async () => ({
                            data: options.eventId ? { id: options.eventId } : null,
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
                  single: async () => ({ data: { id: 'event-new' }, error: null }),
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
              eq: async () => ({
                data: options.deliveries ?? [],
                error: null,
              }),
            }
          },
          insert: async () => ({
            error: options.emailInsertCode ? { code: options.emailInsertCode } : null,
          }),
          update() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      select() {
                        return {
                          maybeSingle: async () => ({
                            data: { id: 'email-1' },
                            error: null,
                          }),
                        }
                      },
                    }
                  },
                }
              },
              in: async () => ({ error: null }),
            }
          },
        }
      }

      return {}
    },
  })
}

describe('processMessageNewPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(true)
    sendPushNotification.mockResolvedValue({ ok: true, sent: 1, failed: 0, skipped: 0 })
    sendStudentMessageEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
  })

  it('skips both channels when message preference is false', async () => {
    mockAdmin({ pref: { message: false } })
    const outcome = await processMessageNewPath({
      studentUserId: 's1',
      messageId: 'm1',
      email: 'a@example.com',
      body: 'secret',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('preference_disabled')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendStudentMessageEmail).not.toHaveBeenCalled()
  })

  it('sends fixed Push payload without message body', async () => {
    mockAdmin({ pref: null })
    const outcome = await processMessageNewPath({
      studentUserId: 's1',
      messageId: 'm1',
      email: 'a@example.com',
      body: '個人情報を含む本文',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('push_sent')
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'message',
        idempotencyKey: messageIdempotencyKey('m1'),
        title: MESSAGE_PUSH_TITLE,
        body: MESSAGE_PUSH_BODY,
        targetPath: MESSAGE_PUSH_PATH,
        tag: MESSAGE_PUSH_TAG,
      }),
    )
    const arg = sendPushNotification.mock.calls[0]![0] as { body: string }
    expect(arg.body).not.toContain('個人情報')
    expect(sendStudentMessageEmail).not.toHaveBeenCalled()
  })

  it('falls back to paced email when no subscriptions', async () => {
    mockAdmin({ pref: { message: true } })
    sendPushNotification.mockResolvedValue({ ok: false, code: 'no_subscriptions' })
    const outcome = await processMessageNewPath({
      studentUserId: 's1',
      messageId: 'm1',
      email: 'a@example.com',
      body: 'hello',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('email_sent')
    expect(sendStudentMessageEmail).toHaveBeenCalled()
  })

  it('is idempotent when push already sent', async () => {
    mockAdmin({
      pref: { message: true },
      eventId: 'ev-1',
      deliveries: [
        {
          id: 'd1',
          channel: 'push',
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    })
    const outcome = await processMessageNewPath({
      studentUserId: 's1',
      messageId: 'm1',
      email: 'a@example.com',
      body: 'hello',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('already_completed')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })
})
