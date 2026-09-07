import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  classifyClassScheduleDryRunFinal,
  evaluateClassScheduleDeliveryDryRunAggregate,
} from '@/lib/class-schedule/class-schedule-dry-run'

const {
  createAdminClient,
  fetchStudentList,
  fetchGradeTagNamesByStudentId,
  sendPushNotification,
  sendClassScheduleFallbackEmail,
  sendEmailToMany,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  fetchStudentList: vi.fn(),
  fetchGradeTagNamesByStudentId: vi.fn(),
  sendPushNotification: vi.fn(),
  sendClassScheduleFallbackEmail: vi.fn(),
  sendEmailToMany: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

vi.mock('@/lib/study/queries', () => ({
  fetchStudentList: () => fetchStudentList(),
}))

vi.mock('@/lib/tags/queries', () => ({
  fetchGradeTagNamesByStudentId: () => fetchGradeTagNamesByStudentId(),
}))

vi.mock('@/lib/push/send-service', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}))

vi.mock('@/lib/class-schedule/class-schedule-email', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/class-schedule/class-schedule-email')
  >('@/lib/class-schedule/class-schedule-email')
  return {
    ...actual,
    sendClassScheduleFallbackEmail: (...args: unknown[]) =>
      sendClassScheduleFallbackEmail(...args),
  }
})

vi.mock('@/lib/email/send', () => ({
  sendEmailToMany: (...args: unknown[]) => sendEmailToMany(...args),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/push/send-config', () => ({
  isPushSendingAvailable: () => true,
}))

describe('classifyClassScheduleDryRunFinal', () => {
  const base = {
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: true,
    emailLookupOk: true,
    hasEmail: true,
    pushSendingEnabled: true,
  }

  it('prefers preference_disabled', () => {
    expect(
      classifyClassScheduleDryRunFinal({ ...base, preferenceEnabled: false }),
    ).toBe('preference_disabled')
  })

  it('uses push when enabled and subscribed', () => {
    expect(classifyClassScheduleDryRunFinal(base)).toBe('would_use_push')
  })
})

describe('evaluateClassScheduleDeliveryDryRunAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchStudentList.mockResolvedValue([
      { id: 's1', email: 'a@example.com' },
      { id: 's2', email: null },
    ])
    fetchGradeTagNamesByStudentId.mockResolvedValue(
      new Map([
        ['s1', '既卒'],
        ['s2', '高3'],
      ]),
    )
    createAdminClient.mockReturnValue({
      from(table: string) {
        if (table === 'notification_preferences') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { class_schedule: true },
                      error: null,
                    }),
                  }
                },
              }
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
                        limit: async () => ({ data: [{ id: 'sub1' }], error: null }),
                      }
                    },
                  }
                },
              }
            },
          }
        }
        return {}
      },
    })
  })

  it('does not call send functions', async () => {
    const result = await evaluateClassScheduleDeliveryDryRunAggregate({
      env: { CLASS_SCHEDULE_DELIVERY_MODE: 'dry-run', PUSH_SENDING_ENABLED: 'true' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.aggregate.kisotsuTotal).toBe(1)
    expect(sendPushNotification).not.toHaveBeenCalled()
    expect(sendClassScheduleFallbackEmail).not.toHaveBeenCalled()
    expect(sendEmailToMany).not.toHaveBeenCalled()
    expect(JSON.stringify(result.aggregate)).not.toContain('s1')
    expect(JSON.stringify(result.aggregate)).not.toContain('@example.com')
  })
})
