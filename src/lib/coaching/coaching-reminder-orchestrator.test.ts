import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  loadBookingPromptCandidates,
  loadSessionReminderCandidates,
  studentStillUnbookedThisWeek,
  sessionBookingStillValid,
  processCoachingReminderNewPath,
  evaluateCoachingAdminDryRunReport,
  createAdminClient,
} = vi.hoisted(() => ({
  loadBookingPromptCandidates: vi.fn(),
  loadSessionReminderCandidates: vi.fn(),
  studentStillUnbookedThisWeek: vi.fn(),
  sessionBookingStillValid: vi.fn(),
  processCoachingReminderNewPath: vi.fn(),
  evaluateCoachingAdminDryRunReport: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/coaching/coaching-reminder-candidates', () => ({
  loadBookingPromptCandidates: (...args: unknown[]) => loadBookingPromptCandidates(...args),
  loadSessionReminderCandidates: (...args: unknown[]) => loadSessionReminderCandidates(...args),
  studentStillUnbookedThisWeek: (...args: unknown[]) => studentStillUnbookedThisWeek(...args),
  sessionBookingStillValid: (...args: unknown[]) => sessionBookingStillValid(...args),
}))

vi.mock('@/lib/coaching/coaching-reminder-new-path', () => ({
  processCoachingReminderNewPath: (...args: unknown[]) => processCoachingReminderNewPath(...args),
}))

vi.mock('@/lib/coaching/coaching-reminder-dry-run', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coaching/coaching-reminder-dry-run')
  >('@/lib/coaching/coaching-reminder-dry-run')
  return {
    ...actual,
    evaluateCoachingAdminDryRunReport: (...args: unknown[]) =>
      evaluateCoachingAdminDryRunReport(...args),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

import { runCoachingBookingPromptJob } from '@/lib/coaching/coaching-booking-prompt-orchestrator'
import { runCoachingSessionReminderJob } from '@/lib/coaching/coaching-session-reminder-orchestrator'

const STUDENT = '11111111-1111-1111-1111-111111111111'

describe('coaching reminder orchestrators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('booking dry-run aggregates without chat or push', async () => {
    loadBookingPromptCandidates.mockResolvedValue({
      ok: true,
      weekMondayKey: '2026-09-07',
      weekDates: ['2026-09-07'],
      candidates: [{ studentId: STUDENT, email: 'a@example.com' }],
      bookedStudentCount: 0,
    })
    evaluateCoachingAdminDryRunReport.mockResolvedValue({
      ok: true,
      report: {
        bookingPromptCurrent: {
          wouldUsePush: 1,
          wouldFallbackEmail: 0,
          preferenceDisabled: 0,
          cannotDeliver: 0,
          failed: 0,
        },
      },
    })

    const result = await runCoachingBookingPromptJob({
      COACHING_REMINDER_DELIVERY_MODE: 'dry-run',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.mode).toBe('dry-run')
    expect(result.summary.wouldUsePush).toBe(1)
    expect(result.summary.chatCreated).toBe(0)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('session legacy skips all external sends', async () => {
    loadSessionReminderCandidates.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      candidates: [
        {
          bookingId: 'b1',
          studentId: STUDENT,
          email: 'a@example.com',
          startsAt: '2026-09-07T01:30:00.000Z',
          slotDate: '2026-09-07',
        },
      ],
    })

    const result = await runCoachingSessionReminderJob({
      COACHING_REMINDER_DELIVERY_MODE: 'legacy',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.legacySkipped).toBe(1)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })

  it('session all path rechecks cancel before send', async () => {
    loadSessionReminderCandidates.mockResolvedValue({
      ok: true,
      tomorrowKey: '2026-09-07',
      candidates: [
        {
          bookingId: 'b1',
          studentId: STUDENT,
          email: 'a@example.com',
          startsAt: '2026-09-07T01:30:00.000Z',
          slotDate: '2026-09-07',
        },
      ],
    })
    createAdminClient.mockReturnValue({})
    sessionBookingStillValid.mockResolvedValue({ ok: true, valid: false })

    const result = await runCoachingSessionReminderJob({
      COACHING_REMINDER_DELIVERY_MODE: 'all',
      VERCEL_ENV: 'production',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.cancelledOrChanged).toBe(1)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })

  it('booking allowlist miss creates chat but skips new path', async () => {
    loadBookingPromptCandidates.mockResolvedValue({
      ok: true,
      weekMondayKey: '2026-09-07',
      weekDates: ['2026-09-07'],
      candidates: [{ studentId: STUDENT, email: 'a@example.com' }],
      bookedStudentCount: 0,
    })
    studentStillUnbookedThisWeek.mockResolvedValue({ ok: true, unbooked: true })
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { id: 'admin-1' }, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'chat_messages') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lt: () => ({
                      limit: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async () => ({ error: null }),
          }
        }
        throw new Error(table)
      },
    })

    const other = '22222222-2222-2222-2222-222222222222'
    const result = await runCoachingBookingPromptJob({
      COACHING_REMINDER_DELIVERY_MODE: 'allowlist',
      COACHING_REMINDER_PUSH_ALLOWLIST: other,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.chatCreated).toBe(1)
    expect(processCoachingReminderNewPath).not.toHaveBeenCalled()
  })
})
