import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  sendPushNotification,
  isPushSendingAvailable,
  sendAnnouncementFallbackEmail,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendPushNotification: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  sendAnnouncementFallbackEmail: vi.fn(),
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

vi.mock('@/lib/announcements/announcement-email', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/announcements/announcement-email')
  >('@/lib/announcements/announcement-email')
  return {
    ...actual,
    sendAnnouncementFallbackEmail: (...args: unknown[]) =>
      sendAnnouncementFallbackEmail(...args),
  }
})

import { processAnnouncementNewPath } from '@/lib/announcements/announcement-new-path'
import {
  ANNOUNCEMENT_PUSH_BODY,
  ANNOUNCEMENT_PUSH_PATH,
  ANNOUNCEMENT_PUSH_TITLE,
  announcementIdempotencyKey,
} from '@/lib/announcements/announcement-email'

type Pref = { announcement: boolean } | null

function mockAdmin(options: {
  pref?: Pref | 'error'
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
                  single: async () => ({
                    data: { id: 'event-new' },
                    error: null,
                  }),
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
            error: options.emailInsertCode
              ? { code: options.emailInsertCode }
              : null,
          }),
          update(patch?: Record<string, unknown>) {
            void patch
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
                  in: async () => ({ error: null }),
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

describe('processAnnouncementNewPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(true)
    sendPushNotification.mockResolvedValue({ ok: true, sent: 1, failed: 0, skipped: 0 })
    sendAnnouncementFallbackEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
  })

  it('skips both channels when announcement preference is false', async () => {
    mockAdmin({ pref: { announcement: false } })
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'Hello',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('preference_disabled')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendAnnouncementFallbackEmail).not.toHaveBeenCalled()
  })

  it('treats missing preference row as enabled and sends fixed Push payload', async () => {
    mockAdmin({ pref: null })
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'Secret body should not appear',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('push_sent')
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'announcement',
        idempotencyKey: announcementIdempotencyKey('ann-1'),
        title: ANNOUNCEMENT_PUSH_TITLE,
        body: ANNOUNCEMENT_PUSH_BODY,
        targetPath: ANNOUNCEMENT_PUSH_PATH,
      }),
    )
    expect(sendAnnouncementFallbackEmail).not.toHaveBeenCalled()
    const call = sendPushNotification.mock.calls[0]![0] as { body: string; title: string }
    expect(call.body).not.toContain('Secret')
    expect(JSON.stringify(call)).not.toContain('@')
  })

  it('falls back to paced email when push has no subscriptions', async () => {
    mockAdmin({ pref: { announcement: true } })
    sendPushNotification.mockResolvedValue({
      ok: false,
      code: 'no_subscriptions',
    })
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'T',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('email_sent')
    expect(sendAnnouncementFallbackEmail).toHaveBeenCalled()
  })

  it('does not email when push already sent (idempotent)', async () => {
    mockAdmin({
      pref: { announcement: true },
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
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'T',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('already_completed')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendAnnouncementFallbackEmail).not.toHaveBeenCalled()
  })

  it('skips external send on non-production Vercel', async () => {
    mockAdmin({ pref: { announcement: true } })
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'T',
      env: { VERCEL_ENV: 'preview' },
    })
    expect(outcome).toBe('non_production_skip')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('does not auto-resend after email failed', async () => {
    mockAdmin({
      pref: { announcement: true },
      eventId: 'ev-1',
      deliveries: [
        {
          id: 'd1',
          channel: 'email',
          status: 'failed',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    })
    const outcome = await processAnnouncementNewPath({
      candidate: { studentId: 's1', email: 'a@example.com' },
      announcementId: 'ann-1',
      title: 'T',
      env: { VERCEL_ENV: 'production' },
    })
    expect(outcome).toBe('email_failed')
    expect(sendAnnouncementFallbackEmail).not.toHaveBeenCalled()
  })
})
