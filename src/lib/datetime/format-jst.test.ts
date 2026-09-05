import { describe, expect, it } from 'vitest'
import { formatJstDateTime } from '@/lib/datetime/format-jst'

describe('formatJstDateTime', () => {
  it('maps UTC 22:01 to next-day JST 07:01', () => {
    expect(formatJstDateTime('2024-03-15T22:01:00.000Z')).toBe('2024/3/16 7:01')
  })

  it('maps UTC 14:00 to same-day JST 23:00', () => {
    expect(formatJstDateTime('2024-03-15T14:00:00.000Z')).toBe('2024/3/15 23:00')
  })

  it('handles month and year rollover into JST', () => {
    expect(formatJstDateTime('2023-12-31T16:00:00.000Z')).toBe('2024/1/1 1:00')
  })

  it('is null-safe', () => {
    expect(formatJstDateTime(null)).toBe('—')
    expect(formatJstDateTime(undefined)).toBe('—')
    expect(formatJstDateTime('')).toBe('—')
  })
})
