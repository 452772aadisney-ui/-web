import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertDryRunFinalSum,
  classifyStudyReminderDryRunFinal,
  emptyDryRunAggregate,
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
