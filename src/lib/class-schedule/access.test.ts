import { describe, expect, it } from 'vitest'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'

/**
 * Routing helpers that rely on Next redirect/DB are covered in page integration.
 * Pure grade-tag gate used by access.ts:
 */
describe('kisotsu class-schedule access gate', () => {
  it('allows only 既卒 grade tag', () => {
    expect(isKisotsuGradeTag('既卒')).toBe(true)
    expect(isKisotsuGradeTag('高3')).toBe(false)
    expect(isKisotsuGradeTag(null)).toBe(false)
  })
})
