import { describe, expect, it } from 'vitest'
import {
  FLASH_TOAST_MESSAGES,
  getFlashToastMessage,
  isFlashToastKind,
} from '@/lib/toast/flash-toast'

describe('flash toast messages', () => {
  it('maps each kind to a Japanese message', () => {
    expect(FLASH_TOAST_MESSAGES.login).toBe('ログインしました')
    expect(FLASH_TOAST_MESSAGES.logout).toBe('ログアウトしました')
    expect(FLASH_TOAST_MESSAGES.auth_required).toBe('ログインが必要です')
    expect(getFlashToastMessage('login')).toBe(FLASH_TOAST_MESSAGES.login)
  })

  it('validates kind values', () => {
    expect(isFlashToastKind('login')).toBe(true)
    expect(isFlashToastKind('logout')).toBe(true)
    expect(isFlashToastKind('auth_required')).toBe(true)
    expect(isFlashToastKind('other')).toBe(false)
    expect(isFlashToastKind(null)).toBe(false)
  })
})
