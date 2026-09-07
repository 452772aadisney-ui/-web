import { describe, expect, it } from 'vitest'
import {
  resolveClassScheduleCreateFlashKind,
  resolveClassScheduleNotifyFlashOutcome,
} from '@/lib/class-schedule/flash-toast'
import { classScheduleNotifySuccessMessage } from '@/lib/class-schedule/class-schedule-orchestrator'
import type { ClassScheduleDeliverySummary } from '@/lib/class-schedule/class-schedule-orchestrator'

function baseSummary(
  overrides: Partial<ClassScheduleDeliverySummary>,
): ClassScheduleDeliverySummary {
  return {
    ok: true,
    mode: 'legacy',
    recipients: 0,
    pushSucceeded: 0,
    emailFallbackSucceeded: 0,
    preferenceDisabled: 0,
    cannotDeliver: 0,
    failed: 0,
    legacyEmailRecipientCount: 0,
    legacyEmailSentCount: 0,
    alreadyCompleted: 0,
    inProgress: 0,
    stalePending: 0,
    emailFailed: 0,
    nonProductionSkip: 0,
    durationMs: 1,
    emailUnprocessedCount: 0,
    timedOut: false,
    ...overrides,
  }
}

describe('class-schedule success toast messaging', () => {
  it('keeps legacy save message without notify failure wording', () => {
    const message = classScheduleNotifySuccessMessage(
      '授業予定を登録しました',
      baseSummary({ mode: 'legacy', recipients: 3 }),
    )
    expect(message).toBe('授業予定を登録しました')
    expect(
      resolveClassScheduleCreateFlashKind(
        false,
        resolveClassScheduleNotifyFlashOutcome({
          mode: 'legacy',
          notifyPartialFailure: false,
          pushSucceeded: 0,
          emailFallbackSucceeded: 0,
          legacyEmailSentCount: 0,
          alreadyCompleted: 0,
        }),
      ),
    ).toBe('class_schedule_created')
  })

  it('distinguishes save success from partial notify failure', () => {
    const summary = baseSummary({
      mode: 'all',
      recipients: 2,
      pushSucceeded: 1,
      failed: 1,
      ok: false,
    })
    const message = classScheduleNotifySuccessMessage(
      '授業予定を登録しました',
      summary,
    )
    expect(message).toContain('一部')
    expect(message).not.toBe('授業予定の保存に失敗しました')

    const outcome = resolveClassScheduleNotifyFlashOutcome({
      mode: 'all',
      notifyPartialFailure: true,
      pushSucceeded: 1,
      emailFallbackSucceeded: 0,
      legacyEmailSentCount: 0,
      alreadyCompleted: 0,
    })
    expect(outcome).toBe('partial')
    expect(resolveClassScheduleCreateFlashKind(true, outcome)).toBe(
      'class_schedule_created_notify_partial',
    )
  })

  it('maps total notify failure after save without calling it a save failure', () => {
    const outcome = resolveClassScheduleNotifyFlashOutcome({
      mode: 'all',
      notifyPartialFailure: true,
      pushSucceeded: 0,
      emailFallbackSucceeded: 0,
      legacyEmailSentCount: 0,
      alreadyCompleted: 0,
    })
    expect(outcome).toBe('failed')
    expect(resolveClassScheduleCreateFlashKind(true, outcome)).toBe(
      'class_schedule_created_notify_failed',
    )
  })
})
