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
      pushBody: '今週のコーチングを予約してください。',
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
      pushBody: '今週のコーチングを予約してください。',
      tag: 't',
      env: { VERCEL_ENV: 'production', PUSH_SENDING_ENABLED: 'true' },
    })

    expect(outcome).toBe('push_sent')
    expect(sendBookingPromptEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'coaching_reminder',
        title: '受験生web',
        body: '今週のコーチングを予約してください。',
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
        },
      }),
    )

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'session-previous-day:bk:2026-09-07T01:30:00.000Z',
      kind: 'session_previous_day',
      pushBody: '明日10:30からコーチングです。',
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

  it('admin_reschedule retries failed email without duplicating a sent push', async () => {
    let updateCalls = 0

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
              ],
              error: null,
            }),
          }),
          // DELETE/INSERT are not used in this retry flow; we only reclaim by UPDATE.
          delete: () => {
            throw new Error('delete() must not be called')
          },
          insert: async () => {
            throw new Error('insert() must not be called')
          },
          update: () => {
            updateCalls += 1
            const chain: any = {}
            chain.eq = () => chain
            chain.select = () => ({
              maybeSingle: async () => ({ data: { id: 'd-email-new' }, error: null }),
            })
            return chain
          },
        },
      }),
    )

    isPushSendingAvailable.mockReturnValue(false)

    const outcome = await processCoachingReminderNewPath({
      studentUserId: STUDENT,
      email: 's@example.com',
      idempotencyKey: 'admin-reschedule:b1:11111111-1111-1111-1111-111111111111',
      kind: 'admin_reschedule',
      pushBody: 'コーチングの予約が変更されました。内容を確認してください。',
      coachName: '山田',
      datetimeLabel: '3月10日 10:00〜10:50',
      tag: 't',
      env: { VERCEL_ENV: 'production' },
    })

    expect(outcome).toBe('email_sent')
    expect(updateCalls).toBeGreaterThanOrEqual(2)
    expect(sendAdminRescheduleEmail).toHaveBeenCalledTimes(1)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('keeps already_completed when push was sent (no duplicate channel send)', async () => {
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
      coachName: '山田',
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
