import { describe, expect, it } from 'vitest'
import {
  formatPageItemRangeLabel,
  getPageItemRange,
  getTotalPages,
  parsePageParam,
} from '@/lib/pagination'

describe('pagination helpers', () => {
  it('parsePageParam clamps invalid and out-of-range pages', () => {
    expect(parsePageParam(undefined, 3)).toBe(1)
    expect(parsePageParam('abc', 3)).toBe(1)
    expect(parsePageParam('0', 3)).toBe(1)
    expect(parsePageParam('-2', 3)).toBe(1)
    expect(parsePageParam('2', 3)).toBe(2)
    expect(parsePageParam('99', 3)).toBe(3)
    expect(parsePageParam('5', 0)).toBe(1)
  })

  it('getTotalPages handles empty and partial last pages', () => {
    expect(getTotalPages(0, 20)).toBe(0)
    expect(getTotalPages(1, 20)).toBe(1)
    expect(getTotalPages(20, 20)).toBe(1)
    expect(getTotalPages(21, 20)).toBe(2)
  })

  it('getPageItemRange avoids 1～0 for empty lists', () => {
    expect(getPageItemRange(1, 20, 0)).toBeNull()
    expect(formatPageItemRangeLabel(1, 20, 0)).toBeNull()
  })

  it('getPageItemRange covers first, middle, and last pages', () => {
    expect(getPageItemRange(1, 20, 47)).toEqual({ from: 1, to: 20 })
    expect(getPageItemRange(2, 20, 47)).toEqual({ from: 21, to: 40 })
    expect(getPageItemRange(3, 20, 47)).toEqual({ from: 41, to: 47 })
    expect(formatPageItemRangeLabel(2, 20, 47)).toBe('21～40件を表示')
  })

  it('getPageItemRange returns null when page starts past totalCount', () => {
    expect(getPageItemRange(5, 20, 47)).toBeNull()
  })
})
