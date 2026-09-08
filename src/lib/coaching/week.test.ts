import { describe, expect, it } from 'vitest'
import {
  formatWeekRange,
  getWeekStartMonday,
  getWeekdays,
  shiftWeekStart,
} from '@/lib/coaching/week'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('coaching week helpers (Mon–Sun)', () => {
  it('returns Monday–Sunday for a mid-week JST date key', () => {
    // 2026-09-09 is Wednesday
    const monday = getWeekStartMonday('2026-09-09')
    expect(monday).toBe('2026-09-07')
    const days = getWeekdays(monday)
    expect(days).toHaveLength(7)
    expect(days[0]?.date).toBe('2026-09-07')
    expect(days[6]?.date).toBe('2026-09-13')
    expect(days.map((d) => d.weekdayLabel)).toEqual(['月', '火', '水', '木', '金', '土', '日'])
  })

  it('handles month and year boundaries', () => {
    expect(getWeekStartMonday('2026-01-01')).toBe('2025-12-29')
    expect(getWeekdays('2025-12-29')[6]?.date).toBe('2026-01-04')
    expect(formatWeekRange('2025-12-29')).toContain('〜')
  })

  it('shifts by full weeks', () => {
    expect(shiftWeekStart('2026-09-07', 1)).toBe('2026-09-14')
    expect(shiftWeekStart('2026-09-07', -1)).toBe('2026-08-31')
  })

  it('proxy booking uses week mode, not 4-day window copy', () => {
    const proxy = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/AdminCoachingProxyBooking.tsx'),
      'utf8',
    )
    const grid = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/CoachingWeekGrid.tsx'),
      'utf8',
    )
    const page = readFileSync(
      path.join(process.cwd(), 'src/app/admin/coaching/bookings/page.tsx'),
      'utf8',
    )

    expect(proxy).toContain("mode=\"proxy\"")
    expect(proxy).toContain('weekStart={weekStart}')
    expect(proxy).not.toContain('windowStart')
    expect(grid).toContain("labels=\"text\"")
    expect(grid).toContain('前の週')
    expect(grid).toContain('次の週')
    expect(grid).not.toMatch(/mode === 'proxy'[\s\S]*前の4日/)
    expect(proxy).toContain('AdminStudentCombobox')
    expect(page).toContain('getWeekdays(weekStart)')
    expect(page).toContain('getWeekStartMonday')
    expect(page).not.toContain('getDayWindow')
  })
})
