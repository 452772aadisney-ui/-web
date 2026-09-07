import { describe, expect, it } from 'vitest'
import {
  FLASH_TOAST_COOKIE,
  FLASH_TOAST_COOKIE_OPTIONS,
  FLASH_TOAST_COOKIE_SECURE,
  FLASH_TOAST_MESSAGES,
  getFlashToastMessage,
  isFlashToastKind,
  type FlashToastKind,
} from '@/lib/toast/flash-toast'
import {
  CLASS_SCHEDULE_FLASH_KINDS,
  resolveClassScheduleCreateFlashKind,
  resolveClassScheduleNotifyFlashOutcome,
} from '@/lib/class-schedule/flash-toast'

describe('class-schedule flash toast kinds', () => {
  it('uses fixed allowlisted kinds only', () => {
    for (const kind of CLASS_SCHEDULE_FLASH_KINDS) {
      expect(isFlashToastKind(kind)).toBe(true)
      expect(getFlashToastMessage(kind).length).toBeGreaterThan(0)
      expect(FLASH_TOAST_MESSAGES[kind]).toBe(getFlashToastMessage(kind))
    }
  })

  it('rejects arbitrary client-injected message kinds', () => {
    expect(isFlashToastKind('授業予定を登録しました')).toBe(false)
    expect(isFlashToastKind('class_schedule_created<script>')).toBe(false)
    expect(isFlashToastKind('login; path=/')).toBe(false)
  })

  it('maps create outcomes without treating legacy as failure', () => {
    expect(resolveClassScheduleCreateFlashKind(false, 'ok')).toBe(
      'class_schedule_created',
    )
    expect(
      resolveClassScheduleNotifyFlashOutcome({
        mode: 'legacy',
        notifyPartialFailure: false,
        pushSucceeded: 0,
        emailFallbackSucceeded: 0,
        legacyEmailSentCount: 0,
        alreadyCompleted: 0,
      }),
    ).toBe('ok')
    expect(
      resolveClassScheduleCreateFlashKind(
        true,
        resolveClassScheduleNotifyFlashOutcome({
          mode: 'legacy',
          notifyPartialFailure: true,
          pushSucceeded: 0,
          emailFallbackSucceeded: 0,
          legacyEmailSentCount: 0,
          alreadyCompleted: 0,
        }),
      ),
    ).toBe('class_schedule_created')
  })

  it('maps partial and failed notify after successful save', () => {
    expect(resolveClassScheduleCreateFlashKind(true, 'partial')).toBe(
      'class_schedule_created_notify_partial',
    )
    expect(resolveClassScheduleCreateFlashKind(true, 'failed')).toBe(
      'class_schedule_created_notify_failed',
    )
    expect(FLASH_TOAST_MESSAGES.class_schedule_created).toBe(
      '授業予定を登録しました',
    )
    expect(FLASH_TOAST_MESSAGES.class_schedule_created_notify_partial).toBe(
      '予定は保存しましたが、一部の通知に失敗しました',
    )
    expect(FLASH_TOAST_MESSAGES.class_schedule_created_notify_failed).toBe(
      '予定は保存しましたが、通知を送信できませんでした',
    )
    expect(FLASH_TOAST_MESSAGES.class_schedule_day_deleted).toBe(
      '誤登録を削除しました',
    )
  })

  it('keeps shared cookie security flags', () => {
    expect(FLASH_TOAST_COOKIE).toBe('app_flash_toast')
    expect(FLASH_TOAST_COOKIE_OPTIONS.httpOnly).toBe(false)
    expect(FLASH_TOAST_COOKIE_OPTIONS.sameSite).toBe('lax')
    expect(FLASH_TOAST_COOKIE_OPTIONS.path).toBe('/')
    expect(FLASH_TOAST_COOKIE_OPTIONS.secure).toBe(FLASH_TOAST_COOKIE_SECURE)
  })

  it('does not collide with auth flash kinds', () => {
    const auth: FlashToastKind[] = ['login', 'logout', 'auth_required']
    for (const kind of auth) {
      expect(CLASS_SCHEDULE_FLASH_KINDS.includes(kind as never)).toBe(false)
    }
  })
})
