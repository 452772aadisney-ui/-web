import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  sendPushNotification,
  isPushSendingAvailable,
  sendBookingPromptEmail,
  sendSessionPreviousDayEmail,
  sendAdminRescheduleEmail,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendPushNotification: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  sendBookingPromptEmail: vi.fn(),
  sendSessionPreviousDayEmail: vi.fn(),
  sendAdminRescheduleEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock('@/lib/push/send-service', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}))

vi.mock('@/lib/push/send-config', () => ({
  isPushSendingAvailable: (...args: unknown[]) => isPushSendingAvailable(...args),
}))

vi.mock('@/lib/coaching/coaching-reminder-email', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-reminder-email')
  >('@/lib/coaching/coaching-reminder-email')
  return {
    ...actual,
    sendBookingPromptEmail: (...args: unknown[]) => sendBookingPromptEmail(...args),
    sendSessionPreviousDayEmail: (...args: unknown[]) =>
      sendSessionPreviousDayEmail(...args),
    sendAdminRescheduleEmail: (...args: unknown[]) => sendAdminRescheduleEmail(...args),
  }
})

import { processCoachingReminderNewPath } from '@/lib/coaching/coaching-reminder-new-path'

const STUDENT = '11111111-1111-1111-1111-111111111111'

type TableHandler = {
  select?: (...args: unknown[]) => unknown
  insert?: (...args: unknown[]) => unknown
  update?: (...args: unknown[]) => unknown
  delete?: (...args: unknown[]) => unknown
}

function makeAdmin(handlers: Record<string, TableHandler>) {
  return {
    from(table: string) {
      const h = handlers[table]
      if (!h) throw new Error(`unexpected table ${table}`)
      return h
    },
  }
}

describe('processCoachingReminderNewPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(true)
    sendBookingPromptEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
    sendSessionPreviousDayEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
    sendAdminRescheduleEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
  })

  it('returns preference_disabled without push or email', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { coaching_reminder: false },
                error: null,
              }),
            }),
          }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'booking-prompt:2026-09-07',
      kind: 'booking_prompt',
      pushBody: 'booking please',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('preference_disabled')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendBookingPromptEmail).not.toHaveBeenCalled()
  })

  it('skips external send on non-production', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'booking-prompt:2026-09-07',
      kind: 'booking_prompt',
      pushBody: 'x',
      tag: 't',
      env: { VERCEL_ENV: 'preview' },
    })

    expect(outcome).toBe('non_production_skip')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('returns push_sent when at least one device succeeds', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
        notification_events: {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        },
      }),
    )
    sendPushNotification.mockResolvedValue({ ok: true, sent: 1 })

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'booking-prompt:2026-09-07',
      kind: 'booking_prompt',
      pushBody: 'booking please',
      tag: 't',
      env: { VERCEL_ENV: 'production', PUSH_SENDING_ENABLED: 'true' },
    })

    expect(outcome).toBe('push_sent')
    expect(sendBookingPromptEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'coaching_reminder',
        title: '受験生web',
        body: 'booking please',
        targetPath: '/dashboard/coaching',
      }),
    )
  })

  it('falls back to email when push sending unavailable', async () => {
    isPushSendingAvailable.mockReturnValue(false)

    let emailInsertCount = 0
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
        notification_events: {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'evt-1' }, error: null }),
            }),
          }),
        },
        notification_deliveries: {
          insert: async () => {
            emailInsertCount += 1
            return { error: null }
          },
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: 'd1' }, error: null }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'd1' }, error: null }),
              }),
            }),
          }),
        },
        notification_delivery_attempts: {
          insert: async () => ({ error: null }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'session-previous-day:bk:2026-09-07T01:30:00.000Z',
      kind: 'session_previous_day',
      pushBody: 'session tomorrow',
      hm: '10:30',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('email_sent')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendSessionPreviousDayEmail).toHaveBeenCalled()
    expect(emailInsertCount).toBe(1)
  })

  it('treats existing push sent as already_completed', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
        notification_events: {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
                }),
              }),
            }),
          }),
        },
        notification_deliveries: {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: 'd1',
                  channel: 'push',
                  status: 'sent',
                  sent_at: '2026-09-05T12:00:00.000Z',
                  created_at: '2026-09-05T12:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'booking-prompt:2026-09-07',
      kind: 'booking_prompt',
      pushBody: 'x',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('already_completed')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendBookingPromptEmail).not.toHaveBeenCalled()
  })

  it('admin_reschedule retries failed email via attempt history (push failed only)', async () => {
    // Policy: push sent => already_completed (email not retried).
    // This case is push-failed + email-failed => email retry is correct.
    let attemptInserts = 0
    let attemptFinalizes = 0

    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'notification_preferences') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
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
        if (table === 'notification_deliveries') {
          return {
            select: () => ({
              eq: (col: string) => {
                if (col === 'event_id') {
                  const rows = [
                    {
                      id: 'd-push',
                      channel: 'push',
                      status: 'failed',
                      sent_at: null,
                      created_at: '2026-09-05T12:00:00.000Z',
                    },
                    {
                      id: 'd-email',
                      channel: 'email',
                      status: 'failed',
                      sent_at: null,
                      created_at: '2026-09-05T12:00:00.000Z',
                    },
                  ]
                  return {
                    data: rows,
                    error: null,
                    eq: () => ({
                      maybeSingle: async () => ({ data: { id: 'd-email' }, error: null }),
                    }),
                    then: (resolve: (v: unknown) => unknown) =>
                      Promise.resolve(resolve({ data: rows, error: null })),
                  }
                }
                return {
                  eq: () => ({
                    maybeSingle: async () => ({ data: { id: 'd-email' }, error: null }),
                  }),
                }
              },
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          }
        }
        if (table === 'notification_delivery_attempts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { attempt_no: 1 }, error: null }),
                  }),
                }),
              }),
            }),
            insert: () => {
              attemptInserts += 1
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'att-2', claim_token: 'tok-2', attempt_no: 2 },
                    error: null,
                  }),
                }),
              }
            },
            update: () => {
              attemptFinalizes += 1
              const c: Record<string, unknown> = {}
              const self = () => c
              c.eq = self
              c.select = () => ({
                maybeSingle: async () => ({ data: { id: 'att-2' }, error: null }),
              })
              return c
            },
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })

    isPushSendingAvailable.mockReturnValue(false)

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'admin-reschedule:b1:11111111-1111-1111-1111-111111111111',
      kind: 'admin_reschedule',
      pushBody: 'reschedule body',
      coachName: 'Yamada',
      datetimeLabel: 'Mar 10 10:00',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('email_sent')
    expect(attemptInserts).toBe(1)
    expect(attemptFinalizes).toBe(1)
    expect(sendAdminRescheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'admin-reschedule:b1:11111111-1111-1111-1111-111111111111',
      }),
    )
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('keeps already_completed when push was sent (no email retry)', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
        notification_events: {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
                }),
              }),
            }),
          }),
        },
        notification_deliveries: {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: 'd1',
                  channel: 'push',
                  status: 'sent',
                  sent_at: '2026-09-05T12:00:00.000Z',
                  created_at: '2026-09-05T12:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'admin-reschedule:b1:11111111-1111-1111-1111-111111111111',
      kind: 'admin_reschedule',
      pushBody: 'x',
      coachName: 'Yamada',
      datetimeLabel: 'x',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('already_completed')
    expect(sendAdminRescheduleEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('does not auto-retry email_terminal for non-admin-reschedule kinds', async () => {
    createAdminClient.mockReturnValue(
      makeAdmin({
        notification_preferences: {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        },
        notification_events: {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
                }),
              }),
            }),
          }),
        },
        notification_deliveries: {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: 'd-email',
                  channel: 'email',
                  status: 'failed',
                  sent_at: null,
                  created_at: '2026-09-05T12:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'booking-prompt:2026-09-07',
      kind: 'booking_prompt',
      pushBody: 'x',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('email_failed')
    expect(sendBookingPromptEmail).not.toHaveBeenCalled()
  })
})
