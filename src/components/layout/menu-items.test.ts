import { describe, expect, it } from 'vitest'
import {
  ADMIN_HAMBURGER_ITEMS,
  STUDENT_HAMBURGER_ITEMS,
} from '@/components/layout/menu-items'

describe('notification settings menu wiring', () => {
  it('adds student notification settings without admin entry', () => {
    expect(STUDENT_HAMBURGER_ITEMS.some((item) => item.href === '/dashboard/notifications')).toBe(
      true,
    )
    expect(STUDENT_HAMBURGER_ITEMS.some((item) => item.label === '通知設定')).toBe(true)
    expect(ADMIN_HAMBURGER_ITEMS.some((item) => item.href.includes('notifications'))).toBe(false)
  })
})
