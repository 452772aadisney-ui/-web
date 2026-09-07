import { describe, expect, it } from 'vitest'
import {
  isHttpsMapUrl,
  isSessionEffectivelyCancelled,
  sessionStatusLabel,
} from '@/lib/class-schedule/format'

describe('isSessionEffectivelyCancelled', () => {
  it('treats day cancel as effective cancel even if session is scheduled', () => {
    expect(isSessionEffectivelyCancelled('cancelled', 'scheduled')).toBe(true)
    expect(sessionStatusLabel({ dayStatus: 'cancelled', sessionStatus: 'scheduled' })).toBe(
      '中止',
    )
  })

  it('treats session cancel alone as cancelled', () => {
    expect(isSessionEffectivelyCancelled('scheduled', 'cancelled')).toBe(true)
  })

  it('keeps scheduled when both are scheduled', () => {
    expect(isSessionEffectivelyCancelled('scheduled', 'scheduled')).toBe(false)
    expect(sessionStatusLabel({ dayStatus: 'scheduled', sessionStatus: 'scheduled' })).toBe(
      '予定',
    )
  })
})

describe('isHttpsMapUrl', () => {
  it('accepts https only', () => {
    expect(isHttpsMapUrl('https://maps.example/x')).toBe(true)
    expect(isHttpsMapUrl('http://maps.example/x')).toBe(false)
    expect(isHttpsMapUrl(null)).toBe(false)
  })
})
