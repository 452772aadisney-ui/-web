import type { FlashToastKind } from '@/lib/toast/flash-toast'

/** Flash kinds used after class-schedule navigations (fixed allowlist only). */
export const CLASS_SCHEDULE_FLASH_KINDS = [
  'class_schedule_created',
  'class_schedule_created_notify_partial',
  'class_schedule_created_notify_failed',
  'class_schedule_day_deleted',
] as const satisfies readonly FlashToastKind[]

export type ClassScheduleFlashKind = (typeof CLASS_SCHEDULE_FLASH_KINDS)[number]

export type ClassScheduleNotifyFlashOutcome = 'ok' | 'partial' | 'failed'

/**
 * Map save + notify outcome to a fixed flash kind.
 * legacy / dry-run / no notify issues → plain created (not an error).
 */
export function resolveClassScheduleCreateFlashKind(
  notifyPartialFailure: boolean | undefined,
  outcome: ClassScheduleNotifyFlashOutcome = 'ok',
): ClassScheduleFlashKind {
  if (!notifyPartialFailure || outcome === 'ok') {
    return 'class_schedule_created'
  }
  if (outcome === 'partial') {
    return 'class_schedule_created_notify_partial'
  }
  return 'class_schedule_created_notify_failed'
}

export function resolveClassScheduleNotifyFlashOutcome(input: {
  mode: string
  notifyPartialFailure: boolean
  pushSucceeded: number
  emailFallbackSucceeded: number
  legacyEmailSentCount: number
  alreadyCompleted: number
}): ClassScheduleNotifyFlashOutcome {
  if (input.mode === 'legacy' || input.mode === 'dry-run') {
    return 'ok'
  }
  if (!input.notifyPartialFailure) {
    return 'ok'
  }
  const succeeded =
    input.pushSucceeded +
    input.emailFallbackSucceeded +
    input.legacyEmailSentCount +
    input.alreadyCompleted
  return succeeded === 0 ? 'failed' : 'partial'
}
