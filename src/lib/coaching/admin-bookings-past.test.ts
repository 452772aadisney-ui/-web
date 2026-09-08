import { describe, expect, it } from 'vitest'
import { sanitizeIlikePattern } from '@/lib/supabase/ilike'
import {
  formatPageItemRangeLabel,
  getTotalPages,
  parsePageParam,
} from '@/lib/pagination'
import { PAST_COACHING_BOOKINGS_PAGE_SIZE } from '@/lib/coaching/queries'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('past coaching bookings search and pagination wiring', () => {
  it('sanitizes ilike patterns and treats blank as no search', () => {
    expect(sanitizeIlikePattern('  ')).toBeNull()
    expect(sanitizeIlikePattern('山田')).toBe('%山田%')
    expect(sanitizeIlikePattern(' 山田 ')).toBe('%山田%')
    expect(sanitizeIlikePattern('a%b_c')).toBe('%abc%')
    expect(sanitizeIlikePattern('x,y(z)')).toBe('%xyz%')
  })

  it('uses 20-item pages and safe range labels', () => {
    expect(PAST_COACHING_BOOKINGS_PAGE_SIZE).toBe(20)
    expect(getTotalPages(20, 20)).toBe(1)
    expect(getTotalPages(21, 20)).toBe(2)
    expect(parsePageParam('0', 3)).toBe(1)
    expect(parsePageParam('99', 3)).toBe(3)
    expect(formatPageItemRangeLabel(1, 20, 0)).toBeNull()
    expect(formatPageItemRangeLabel(1, 20, 5)).toBe('1～5件を表示')
  })

  it('treats sanitized-empty search as zero matches, not all rows', () => {
    expect(sanitizeIlikePattern('%%%')).toBeNull()
    expect(sanitizeIlikePattern('___')).toBeNull()
    expect(sanitizeIlikePattern('()')).toBeNull()
  })

  it('wires pastPage, pastQ, edit button, and shared status labels', () => {
    const page = readFileSync(
      path.join(process.cwd(), 'src/app/admin/coaching/bookings/page.tsx'),
      'utf8',
    )
    const ui = readFileSync(
      path.join(process.cwd(), 'src/components/coaching/AdminCoachingBookings.tsx'),
      'utf8',
    )
    const queries = readFileSync(
      path.join(process.cwd(), 'src/lib/coaching/queries.ts'),
      'utf8',
    )

    expect(page).toContain('pastPage')
    expect(page).toContain('pastQ')
    expect(page).toContain('sortStudentsByGradeThenName')
    expect(page).toContain('fetchPastCoachingBookingsForAdmin')
    expect(page).toContain('ScrollToSectionOnParam')
    expect(page).toContain('paramValue={pastPage}')
    expect(page).toContain('検索を解除')
    expect(page).toContain('pastPage omitted')
    expect(ui).toContain('編集')
    expect(ui).toContain('aria-label={editAriaLabel}')
    expect(ui).toContain('COACHING_BOOKING_STATUS_LABELS')
    expect(ui).not.toMatch(/onClick=\{\(\) => .*booking/)
    expect(queries).toContain('findStudentIdsByNameIlike')
    expect(queries).toContain('sanitizes to nothing must not match all students')
    expect(queries).toContain('.ilike(')
    expect(queries).toContain('range(from, to)')
  })
})
