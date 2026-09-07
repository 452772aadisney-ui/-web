import { describe, expect, it } from 'vitest'
import {
  findFirstInternalOverlap,
  hasOverlappingScheduledSession,
  rangesOverlap,
} from '@/lib/class-schedule/overlap'

describe('rangesOverlap', () => {
  it('allows touching endpoints', () => {
    expect(rangesOverlap({ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' })).toBe(
      false,
    )
  })

  it('rejects partial overlap', () => {
    expect(rangesOverlap({ start: '09:00', end: '10:30' }, { start: '10:00', end: '11:00' })).toBe(
      true,
    )
  })

  it('rejects containment', () => {
    expect(rangesOverlap({ start: '09:00', end: '12:00' }, { start: '10:00', end: '11:00' })).toBe(
      true,
    )
  })
})

describe('hasOverlappingScheduledSession', () => {
  const existing = [
    { id: 'a', start_time: '09:00', end_time: '10:00', status: 'scheduled' },
    { id: 'b', start_time: '10:00', end_time: '11:00', status: 'cancelled' },
    { id: 'c', start_time: '13:00', end_time: '14:00', status: 'scheduled' },
  ]

  it('ignores cancelled sessions', () => {
    expect(
      hasOverlappingScheduledSession(
        { start_time: '10:00', end_time: '11:00', status: 'scheduled' },
        existing,
      ),
    ).toBe(false)
  })

  it('rejects overlap with another scheduled session', () => {
    expect(
      hasOverlappingScheduledSession(
        { start_time: '09:30', end_time: '10:30', status: 'scheduled' },
        existing,
      ),
    ).toBe(true)
  })

  it('excludes self when editing', () => {
    expect(
      hasOverlappingScheduledSession(
        { id: 'a', start_time: '09:00', end_time: '10:00', status: 'scheduled' },
        existing,
        'a',
      ),
    ).toBe(false)
  })

  it('does not treat cancelled candidate as overlapping', () => {
    expect(
      hasOverlappingScheduledSession(
        { start_time: '09:00', end_time: '10:00', status: 'cancelled' },
        existing,
      ),
    ).toBe(false)
  })
})

describe('findFirstInternalOverlap', () => {
  it('detects overlap within a new batch', () => {
    expect(
      findFirstInternalOverlap([
        { start_time: '09:00', end_time: '10:00' },
        { start_time: '09:30', end_time: '10:30' },
      ]),
    ).toEqual({ indexA: 0, indexB: 1 })
  })

  it('allows touching within a batch', () => {
    expect(
      findFirstInternalOverlap([
        { start_time: '09:00', end_time: '10:00' },
        { start_time: '10:00', end_time: '11:00' },
      ]),
    ).toBeNull()
  })
})
