import { describe, expect, it } from 'vitest'
import { safeAuthNextPath } from '@/lib/auth/routes'
import {
  FLASH_TOAST_COOKIE_OPTIONS,
  FLASH_TOAST_COOKIE_SECURE,
  FLASH_TOAST_MESSAGES,
  getFlashToastMessage,
  isFlashToastKind,
} from '@/lib/toast/flash-toast'

describe('flash toast messages', () => {
  it('maps each kind to a Japanese message', () => {
    expect(FLASH_TOAST_MESSAGES.login).toBe('ログインしました')
    expect(FLASH_TOAST_MESSAGES.logout).toBe('ログアウトしました')
    expect(FLASH_TOAST_MESSAGES.auth_required).toBe('ログインが必要です')
    expect(FLASH_TOAST_MESSAGES.class_schedule_created).toBe(
      '授業予定を登録しました',
    )
    expect(getFlashToastMessage('login')).toBe(FLASH_TOAST_MESSAGES.login)
  })

  it('validates kind values (allowlist)', () => {
    expect(isFlashToastKind('login')).toBe(true)
    expect(isFlashToastKind('logout')).toBe(true)
    expect(isFlashToastKind('auth_required')).toBe(true)
    expect(isFlashToastKind('class_schedule_created')).toBe(true)
    expect(isFlashToastKind('class_schedule_day_deleted')).toBe(true)
    expect(isFlashToastKind('other')).toBe(false)
    expect(isFlashToastKind(null)).toBe(false)
    expect(isFlashToastKind('<script>')).toBe(false)
  })

  it('sets cookie flags for client-readable one-shot flash', () => {
    expect(FLASH_TOAST_COOKIE_OPTIONS.httpOnly).toBe(false)
    expect(FLASH_TOAST_COOKIE_OPTIONS.sameSite).toBe('lax')
    expect(FLASH_TOAST_COOKIE_OPTIONS.path).toBe('/')
    expect(FLASH_TOAST_COOKIE_OPTIONS.maxAge).toBe(60)
    expect(FLASH_TOAST_COOKIE_OPTIONS.secure).toBe(FLASH_TOAST_COOKIE_SECURE)
    expect(FLASH_TOAST_COOKIE_SECURE).toBe(process.env.NODE_ENV === 'production')
  })
})

describe('safeAuthNextPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeAuthNextPath('/reset-password')).toBe('/reset-password')
    expect(safeAuthNextPath('/dashboard')).toBe('/dashboard')
  })

  it('rejects open-redirect tricks', () => {
    expect(safeAuthNextPath('https://evil.com')).toBeNull()
    expect(safeAuthNextPath('//evil.com')).toBeNull()
    expect(safeAuthNextPath('/\\evil.com')).toBeNull()
    expect(safeAuthNextPath('@evil.com')).toBeNull()
    expect(safeAuthNextPath('/login@evil.com')).toBeNull()
    expect(safeAuthNextPath(null)).toBeNull()
  })
})
