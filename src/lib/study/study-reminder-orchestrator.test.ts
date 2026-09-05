import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  sendPushNotification,
  isPushSendingAvailable,
  sendMissingStudyLogEmail,
  buildTodayMissingStudyReport,
  notifyStudentsMissingTodayStudyLog,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendPushNotification: vi.fn(),
  isPushSendingAvailable: vi.fn(),
  sendMissingStudyLogEmail: vi.fn(),
  buildTodayMissingStudyReport: vi.fn(),
  notifyStudentsMissingTodayStudyLog: vi.fn(),
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

vi.mock('@/lib/study/study-reminder-email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/study/study-reminder-email')>(
    '@/lib/study/study-reminder-email',
  )
  return {
    ...actual,
    sendMissingStudyLogEmail: (...args: unknown[]) => sendMissingStudyLogEmail(...args),
  }
})

vi.mock('@/lib/study/digest', () => ({
  buildTodayMissingStudyReport: (...args: unknown[]) => buildTodayMissingStudyReport(...args),
}))

vi.mock('@/lib/email/notifications', () => ({
  notifyStudentsMissingTodayStudyLog: (...args: unknown[]) =>
    notifyStudentsMissingTodayStudyLog(...args),
}))

import { processStudyReminderNewPath } from '@/lib/study/study-reminder-new-path'
import { runStudyReminderJob } from '@/lib/study/study-reminder-orchestrator'

type Pref = { study_reminder: boolean } | null

function mockAdmin(options: {
  hasLog?: boolean
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
  const deliveryUpdates: Array<Record<string, unknown>> = []

  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'study_logs') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      limit: async () => ({
                        data: options.hasLog ? [{ id: 'log-1' }] : [],
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    if (options.pref === 'error') {
                      return { data: null, error: { message: 'boom' } }
                    }
                    return {
                      data: options.pref === undefined ? null : options.pref,
                      error: null,
                    }
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
              eq() {
                return Promise.resolve({
                  data: options.deliveries ?? [],
                  error: null,
                })
              },
            }
          },
          insert() {
            if (options.emailInsertCode) {
              return Promise.resolve({ error: { code: options.emailInsertCode } })
            }
            return Promise.resolve({ error: null })
          },
          update(payload: Record<string, unknown>) {
            deliveryUpdates.push(payload)
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.in = () => Promise.resolve({ error: null })
            chain.select = () => chain
            chain.maybeSingle = async () => ({ data: { id: 'd1' }, error: null })
            return chain
          },
        }
      }

      if (table === 'push_subscriptions') {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      limit: async () => ({ data: [{ id: 'sub-1' }], error: null }),
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  })

  return { deliveryUpdates }
}

describe('processStudyReminderNewPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(true)
    sendMissingStudyLogEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
  })

  it('skips when a study log appears before send', async () => {
    mockAdmin({ hasLog: true })
    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
    })
    expect(outcome).toBe('recorded_before_send')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('stops both channels when preference is OFF', async () => {
    mockAdmin({ hasLog: false, pref: { study_reminder: false } })
    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
    })
    expect(outcome).toBe('preference_disabled')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendMissingStudyLogEmail).not.toHaveBeenCalled()
  })

  it('treats missing preference row as ON and sends push', async () => {
    mockAdmin({ hasLog: false, pref: null })
    sendPushNotification.mockResolvedValue({
      ok: true,
      eventCreated: true,
      eventId: 'e1',
      sent: 1,
      failed: 0,
      skipped: 0,
    })

    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
    })
    expect(outcome).toBe('push_sent')
    expect(sendMissingStudyLogEmail).not.toHaveBeenCalled()
  })

  it('does not email when at least one push succeeds', async () => {
    mockAdmin({ hasLog: false, pref: { study_reminder: true } })
    sendPushNotification.mockResolvedValue({
      ok: true,
      eventCreated: true,
      eventId: 'e1',
      sent: 1,
      failed: 2,
      skipped: 0,
    })
    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
    })
    expect(outcome).toBe('push_sent')
    expect(sendMissingStudyLogEmail).not.toHaveBeenCalled()
  })

  it('falls back to email when push sending is disabled', async () => {
    mockAdmin({ hasLog: false, pref: { study_reminder: true } })
    isPushSendingAvailable.mockReturnValue(false)
    sendMissingStudyLogEmail.mockResolvedValue({ ok: true, httpStatus: 200 })

    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
    })
    expect(outcome).toBe('email_sent')
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('skips external sends on Vercel non-production', async () => {
    mockAdmin({ hasLog: false, pref: { study_reminder: true } })
    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: { VERCEL_ENV: 'preview' },
    })
    expect(outcome).toBe('non_production_skip')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendMissingStudyLogEmail).not.toHaveBeenCalled()
  })

  it('does not resend after email failed', async () => {
    mockAdmin({
      hasLog: false,
      pref: { study_reminder: true },
      eventId: 'ev-1',
      deliveries: [
        {
          id: 'd1',
          channel: 'email',
          status: 'failed',
          sent_at: '2026-09-05T12:00:00.000Z',
          created_at: '2026-09-05T12:00:00.000Z',
        },
      ],
    })
    const outcome = await processStudyReminderNewPath({
      candidate: { studentId: 'u1', email: 'a@example.com' },
      dateKey: '2026-09-05',
      dateLabel: '今日',
      env: {},
      nowMs: Date.parse('2026-09-05T13:00:00.000Z'),
    })
    expect(outcome).toBe('email_failed')
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendMissingStudyLogEmail).not.toHaveBeenCalled()
  })
})

describe('runStudyReminderJob modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildTodayMissingStudyReport.mockResolvedValue({
      dateKey: '2026-09-05',
      dateLabel: '今日',
      recorded: [],
      notRecorded: [
        {
          studentId: '11111111-1111-1111-1111-111111111111',
          name: 'A',
          email: 'a@example.com',
        },
        {
          studentId: '22222222-2222-2222-2222-222222222222',
          name: 'B',
          email: 'b@example.com',
        },
      ],
    })
    notifyStudentsMissingTodayStudyLog.mockResolvedValue({
      recipientCount: 2,
      sentCount: 2,
      skippedCount: 0,
    })
  })

  it('uses legacy email only when mode is unset', async () => {
    const result = await runStudyReminderJob({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.mode).toBe('legacy')
    expect(result.summary.legacyEmailSentCount).toBe(2)
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(JSON.stringify(result.summary)).not.toContain('a@example.com')
    expect(JSON.stringify(result.summary)).not.toContain('11111111')
  })

  it('keeps legacy email in dry-run and does not create push sends', async () => {
    const studentIds = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => {
                const chain = {
                  in: () => chain,
                  range: async () => ({
                    data: studentIds.map((id) => ({ id, email: `${id}@example.com` })),
                    error: null,
                  }),
                }
                return chain
              },
            }),
          }
        }
        if (table === 'study_logs') {
          return {
            select: () => ({
              eq: () => {
                const chain = {
                  in: () => chain,
                  range: async () => ({ data: [], error: null }),
                }
                return chain
              },
            }),
          }
        }
        if (table === 'notification_preferences') {
          return {
            select: () => {
              const chain = {
                in: () => chain,
                range: async () => ({ data: [], error: null }),
              }
              return chain
            },
          }
        }
        if (table === 'push_subscriptions') {
          return {
            select: () => ({
              is: () => {
                const chain = {
                  in: () => chain,
                  range: async () => ({
                    data: studentIds.map((id) => ({ user_id: id })),
                    error: null,
                  }),
                }
                return chain
              },
            }),
          }
        }
        throw new Error(table)
      },
    })
    isPushSendingAvailable.mockReturnValue(true)

    const result = await runStudyReminderJob({
      STUDY_REMINDER_DELIVERY_MODE: 'dry-run',
      PUSH_SENDING_ENABLED: 'true',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BKpublicKeyValueThatIsLongEnough1234567890',
      VAPID_PRIVATE_KEY: 'privateKeyValueThatIsLongEnough1234567890',
      VAPID_SUBJECT: 'mailto:ops@example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.mode).toBe('dry-run')
    expect(result.summary.legacyEmailSentCount).toBe(2)
    expect(result.summary.wouldUsePushFirst).toBe(2)
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('routes only allowlisted students to the new path', async () => {
    const allowId = '11111111-1111-1111-1111-111111111111'
    mockAdmin({ hasLog: false, pref: { study_reminder: true } })
    isPushSendingAvailable.mockReturnValue(false)
    sendMissingStudyLogEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
    notifyStudentsMissingTodayStudyLog.mockImplementation(async (report) => ({
      recipientCount: report.notRecorded.length,
      sentCount: report.notRecorded.length,
      skippedCount: 0,
    }))

    const result = await runStudyReminderJob({
      STUDY_REMINDER_DELIVERY_MODE: 'allowlist',
      STUDY_REMINDER_PUSH_ALLOWLIST: allowId,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.mode).toBe('allowlist')
    expect(result.summary.emailFallbackSent).toBe(1)
    expect(result.summary.legacyEmailSentCount).toBe(1)
    const legacyArg = notifyStudentsMissingTodayStudyLog.mock.calls[0][0] as {
      notRecorded: Array<{ studentId: string }>
    }
    expect(legacyArg.notRecorded.map((s) => s.studentId)).toEqual([
      '22222222-2222-2222-2222-222222222222',
    ])
  })
})
