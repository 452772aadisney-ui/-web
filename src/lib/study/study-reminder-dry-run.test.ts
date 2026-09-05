import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertCurrentEffectiveSum,
  assertDryRunFinalSum,
  assertPushReadinessSum,
  classifyCurrentEffective,
  classifyPushReadiness,
  classifyStudyReminderDryRunFinal,
  emptyDryRunAggregate,
  evaluateAdminFullDryRunReport,
  evaluateStudyReminderDryRunAggregate,
} from '@/lib/study/study-reminder-dry-run'

const { createAdminClient, isPushSendingAvailable } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  isPushSendingAvailable: vi.fn(),
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
    isPushSendingAvailable: (...args: unknown[]) => isPushSendingAvailable(...args),
  }
})

vi.mock('@/lib/study/dates', () => ({
  getJstDateKey: () => '2026-09-05',
}))

type StudentRow = { id: string; email: string | null }
type LogRow = { student_id: string }
type PrefRow = { user_id: string; study_reminder: boolean }
type SubRow = { user_id: string }

function mockBulkAdmin(data: {
  students: StudentRow[]
  logs?: LogRow[]
  prefs?: PrefRow[]
  subs?: SubRow[]
  studentsError?: unknown
}) {
  createAdminClient.mockReturnValue({
    from(table: string) {
      const rangeResult = (rows: unknown[], error: unknown = null) => ({
        range: async () => ({ data: rows, error }),
      })

      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                const chain = {
                  in() {
                    return chain
                  },
                  range: async () => ({
                    data: data.studentsError ? null : data.students,
                    error: data.studentsError ?? null,
                  }),
                }
                return chain
              },
            }
          },
        }
      }

      if (table === 'study_logs') {
        return {
          select() {
            return {
              eq() {
                const chain = {
                  in() {
                    return chain
                  },
                  ...rangeResult(data.logs ?? []),
                }
                return chain
              },
            }
          },
        }
      }

      if (table === 'notification_preferences') {
        return {
          select() {
            const chain = {
              in() {
                return chain
              },
              ...rangeResult(data.prefs ?? []),
            }
            return chain
          },
        }
      }

      if (table === 'push_subscriptions') {
        return {
          select() {
            return {
              is() {
                const chain = {
                  in() {
                    return chain
                  },
                  ...rangeResult(data.subs ?? []),
                }
                return chain
              },
            }
          },
        }
      }

      throw new Error(`unexpected table ${table}`)
    },
  })
}

describe('classifyStudyReminderDryRunFinal', () => {
  const base = {
    recordedLookupOk: true,
    hasLog: false,
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: false,
    emailLookupOk: true,
    hasEmail: true,
    pushSendingEnabled: true,
  }

  it('classifies recorded students', () => {
    expect(classifyStudyReminderDryRunFinal({ ...base, hasLog: true })).toBe('already_recorded')
  })

  it('classifies preference off before delivery checks', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        preferenceEnabled: false,
        hasActivePush: true,
      }),
    ).toBe('preference_disabled')
  })

  it('classifies push-first when active push and sending enabled', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        hasActivePush: true,
        pushSendingEnabled: true,
      }),
    ).toBe('would_use_push')
  })

  it('falls back to email when push unavailable', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        hasActivePush: true,
        pushSendingEnabled: false,
        hasEmail: true,
      }),
    ).toBe('would_fallback_email')
  })

  it('falls back to email when no push but email exists', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        hasActivePush: false,
        hasEmail: true,
      }),
    ).toBe('would_fallback_email')
  })

  it('marks cannot deliver when no channel', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        hasActivePush: false,
        hasEmail: false,
      }),
    ).toBe('cannot_deliver')
  })

  it('marks failed on lookup errors', () => {
    expect(
      classifyStudyReminderDryRunFinal({
        ...base,
        preferenceLookupOk: false,
      }),
    ).toBe('failed')
  })
})

describe('evaluateStudyReminderDryRunAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(true)
  })

  it('aggregates mutually exclusive finals that sum to totalStudents', async () => {
    mockBulkAdmin({
      students: [
        { id: 's1', email: 'a@example.com' },
        { id: 's2', email: 'b@example.com' },
        { id: 's3', email: 'c@example.com' },
        { id: 's4', email: null },
        { id: 's5', email: 'e@example.com' },
      ],
      logs: [{ student_id: 's1' }],
      prefs: [
        { user_id: 's2', study_reminder: true },
        { user_id: 's3', study_reminder: false },
        { user_id: 's4', study_reminder: true },
        { user_id: 's5', study_reminder: true },
      ],
      subs: [{ user_id: 's2' }],
    })

    const result = await evaluateStudyReminderDryRunAggregate({
      dateKey: '2026-09-05',
      env: {
        STUDY_REMINDER_DELIVERY_MODE: 'legacy',
        PUSH_SENDING_ENABLED: 'true',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'x'.repeat(80),
        VAPID_PRIVATE_KEY: 'y'.repeat(40),
        VAPID_SUBJECT: 'mailto:ops@example.com',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.aggregate.totalStudents).toBe(5)
    expect(result.aggregate.alreadyRecorded).toBe(1)
    expect(result.aggregate.preferenceDisabled).toBe(1)
    expect(result.aggregate.wouldUsePushFirst).toBe(1)
    expect(result.aggregate.wouldFallbackToEmail).toBe(1) // s5
    expect(result.aggregate.cannotDeliver).toBe(1) // s4
    expect(assertDryRunFinalSum(result.aggregate)).toBe(true)
    expect(JSON.stringify(result.aggregate)).not.toContain('@')
    expect(JSON.stringify(result.aggregate)).not.toContain('endpoint')
  })

  it('treats missing preference row as enabled', async () => {
    mockBulkAdmin({
      students: [{ id: 's1', email: 'a@example.com' }],
      logs: [],
      prefs: [],
      subs: [{ user_id: 's1' }],
    })

    const result = await evaluateStudyReminderDryRunAggregate({
      dateKey: '2026-09-05',
      env: { STUDY_REMINDER_DELIVERY_MODE: 'legacy' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.aggregate.wouldUsePushFirst).toBe(1)
    expect(result.aggregate.preferenceEnabled).toBe(1)
  })

  it('returns empty aggregate for empty studentIds filter', async () => {
    createAdminClient.mockReturnValue({})
    const result = await evaluateStudyReminderDryRunAggregate({
      dateKey: '2026-09-05',
      studentIds: new Set(),
      env: { STUDY_REMINDER_DELIVERY_MODE: 'dry-run' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.aggregate.totalStudents).toBe(0)
    expect(assertDryRunFinalSum(result.aggregate)).toBe(true)
  })

  it('fails closed on initial query error', async () => {
    mockBulkAdmin({
      students: [],
      studentsError: { message: 'db down' },
    })
    const result = await evaluateStudyReminderDryRunAggregate({ dateKey: '2026-09-05' })
    expect(result).toEqual({ ok: false, code: 'query_failed' })
  })

  it('does not call send helpers (module isolation)', async () => {
    mockBulkAdmin({
      students: [{ id: 's1', email: 'a@example.com' }],
      logs: [],
      prefs: [],
      subs: [],
    })
    // Importing send modules after evaluation must stay unused by dry-run.
    const sendService = await import('@/lib/push/send-service')
    const emailSend = await import('@/lib/email/send')
    const pushSpy = vi.spyOn(sendService, 'sendPushNotification')
    const emailSpy = vi.spyOn(emailSend, 'sendEmail')

    await evaluateStudyReminderDryRunAggregate({ dateKey: '2026-09-05' })

    expect(pushSpy).not.toHaveBeenCalled()
    expect(emailSpy).not.toHaveBeenCalled()
    pushSpy.mockRestore()
    emailSpy.mockRestore()
  })
})

describe('assertDryRunFinalSum', () => {
  it('detects inconsistent totals', () => {
    const aggregate = emptyDryRunAggregate('2026-09-05', {
      deliveryMode: 'legacy',
      pushSendingEnabled: false,
    })
    aggregate.totalStudents = 2
    aggregate.alreadyRecorded = 1
    expect(assertDryRunFinalSum(aggregate)).toBe(false)
  })
})

describe('classifyPushReadiness vs classifyCurrentEffective', () => {
  const base = {
    recordedLookupOk: true,
    hasLog: false,
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: true,
    emailLookupOk: true,
    hasEmail: true,
  }

  it('counts active push as ready even when PUSH sending is OFF', () => {
    expect(classifyPushReadiness(base)).toBe('ready_for_push')
    expect(
      classifyCurrentEffective({
        input: { ...base, pushSendingEnabled: false },
        mode: 'all',
        studentId: 's1',
        allowlist: null,
      }),
    ).toBe('would_use_email')
  })

  it('counts push when flag ON under all mode', () => {
    expect(
      classifyCurrentEffective({
        input: { ...base, pushSendingEnabled: true },
        mode: 'all',
        studentId: 's1',
        allowlist: null,
      }),
    ).toBe('would_use_push')
  })

  it('prefers legacy email under legacy and dry-run', () => {
    for (const mode of ['legacy', 'dry-run'] as const) {
      expect(
        classifyCurrentEffective({
          input: { ...base, pushSendingEnabled: true },
          mode,
          studentId: 's1',
          allowlist: null,
        }),
      ).toBe('would_use_email')
    }
  })

  it('uses allowlist membership for new-path under allowlist mode', () => {
    const allow = new Set(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])
    expect(
      classifyCurrentEffective({
        input: { ...base, pushSendingEnabled: true },
        mode: 'allowlist',
        studentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        allowlist: allow,
      }),
    ).toBe('would_use_push')
    expect(
      classifyCurrentEffective({
        input: { ...base, pushSendingEnabled: true },
        mode: 'allowlist',
        studentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        allowlist: allow,
      }),
    ).toBe('would_use_email')
  })

  it('classifies no-push+email and no-push+no-email for readiness', () => {
    expect(
      classifyPushReadiness({ ...base, hasActivePush: false, hasEmail: true }),
    ).toBe('email_only')
    expect(
      classifyPushReadiness({ ...base, hasActivePush: false, hasEmail: false }),
    ).toBe('cannot_deliver')
  })

  it('classifies preference off and recorded', () => {
    expect(classifyPushReadiness({ ...base, preferenceEnabled: false })).toBe(
      'preference_disabled',
    )
    expect(classifyPushReadiness({ ...base, hasLog: true })).toBe('already_recorded')
  })
})

describe('evaluateAdminFullDryRunReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPushSendingAvailable.mockReturnValue(false)
  })

  it('separates readiness push from current legacy email when push flag OFF', async () => {
    mockBulkAdmin({
      students: [
        { id: 's1', email: 'a@example.com' },
        { id: 's2', email: 'b@example.com' },
        { id: 's3', email: null },
      ],
      logs: [],
      prefs: [
        { user_id: 's1', study_reminder: true },
        { user_id: 's2', study_reminder: true },
        { user_id: 's3', study_reminder: false },
      ],
      subs: [{ user_id: 's1' }],
    })

    const result = await evaluateAdminFullDryRunReport({
      dateKey: '2026-09-05',
      env: { STUDY_REMINDER_DELIVERY_MODE: 'legacy' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.report.readiness.readyForPush).toBe(1)
    expect(result.report.readiness.emailOnly).toBe(1)
    expect(result.report.readiness.preferenceDisabled).toBe(1)
    expect(assertPushReadinessSum(result.report.readiness)).toBe(true)

    expect(result.report.current.legacyEmailPreferred).toBe(true)
    expect(result.report.current.pushSendingEnabled).toBe(false)
    expect(result.report.current.wouldUsePush).toBe(0)
    expect(result.report.current.wouldUseEmail).toBe(2) // s1+s2; s3 pref off still legacy email if has email — but s3 has no email
    expect(result.report.current.cannotDeliver).toBe(1) // s3 no email
    expect(result.report.current.preferenceDisabled).toBe(0)
    expect(assertCurrentEffectiveSum(result.report.current)).toBe(true)
    expect(JSON.stringify(result.report)).not.toContain('@')
  })

  it('shows push under all when sending is available', async () => {
    isPushSendingAvailable.mockReturnValue(true)
    mockBulkAdmin({
      students: [{ id: 's1', email: 'a@example.com' }],
      logs: [],
      prefs: [],
      subs: [{ user_id: 's1' }],
    })

    const result = await evaluateAdminFullDryRunReport({
      dateKey: '2026-09-05',
      env: { STUDY_REMINDER_DELIVERY_MODE: 'all' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.readiness.readyForPush).toBe(1)
    expect(result.report.current.wouldUsePush).toBe(1)
    expect(result.report.current.legacyEmailPreferred).toBe(false)
  })

  it('does not call send helpers for dual report', async () => {
    mockBulkAdmin({
      students: [{ id: 's1', email: 'a@example.com' }],
      logs: [],
      prefs: [],
      subs: [],
    })
    const sendService = await import('@/lib/push/send-service')
    const emailSend = await import('@/lib/email/send')
    const pushSpy = vi.spyOn(sendService, 'sendPushNotification')
    const emailSpy = vi.spyOn(emailSend, 'sendEmail')

    await evaluateAdminFullDryRunReport({ dateKey: '2026-09-05' })

    expect(pushSpy).not.toHaveBeenCalled()
    expect(emailSpy).not.toHaveBeenCalled()
    pushSpy.mockRestore()
    emailSpy.mockRestore()
  })
})
