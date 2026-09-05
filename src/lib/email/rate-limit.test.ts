import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESEND_SEND_MIN_INTERVAL_MS,
  classifyResendHttpStatus,
  resetResendSendPaceForTests,
  withResendSendPace,
} from '@/lib/email/rate-limit'

describe('classifyResendHttpStatus', () => {
  it('maps 429 to rate_limited without other statuses', () => {
    expect(classifyResendHttpStatus(429)).toBe('rate_limited')
    expect(classifyResendHttpStatus(500)).toBe('provider_error')
    expect(classifyResendHttpStatus(403)).toBe('provider_error')
  })
})

describe('withResendSendPace', () => {
  beforeEach(() => {
    resetResendSendPaceForTests(0)
  })

  afterEach(() => {
    resetResendSendPaceForTests(0)
  })

  it('does not start overlapping sends and enforces the minimum interval', async () => {
    let now = 1_000
    resetResendSendPaceForTests(now)
    const sleepCalls: number[] = []
    const starts: number[] = []

    const sleep = async (ms: number) => {
      sleepCalls.push(ms)
      now += ms
    }

    const run = (id: number) =>
      withResendSendPace(
        async () => {
          starts.push(now)
          now += 10
          return id
        },
        { nowMs: () => now, sleep },
      )

    // Concurrent callers must still serialize through the shared queue.
    const results = await Promise.all([run(1), run(2), run(3)])
    expect(results).toEqual([1, 2, 3])
    expect(starts[0]).toBe(1_000)
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(RESEND_SEND_MIN_INTERVAL_MS)
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(RESEND_SEND_MIN_INTERVAL_MS)
    expect(sleepCalls.every((ms) => ms === 0 || ms >= RESEND_SEND_MIN_INTERVAL_MS - 10)).toBe(true)
  })

  it('continues pacing after a failure', async () => {
    let now = 0
    const sleep = async (ms: number) => {
      now += ms
    }
    const starts: number[] = []

    await expect(
      withResendSendPace(
        async () => {
          starts.push(now)
          throw new Error('boom')
        },
        { nowMs: () => now, sleep },
      ),
    ).rejects.toThrow('boom')

    await withResendSendPace(
      async () => {
        starts.push(now)
        return 'ok'
      },
      { nowMs: () => now, sleep },
    )

    expect(starts).toHaveLength(2)
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(RESEND_SEND_MIN_INTERVAL_MS)
  })
})
