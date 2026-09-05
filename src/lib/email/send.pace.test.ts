import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESEND_SEND_MIN_INTERVAL_MS, resetResendSendPaceForTests } from '@/lib/email/rate-limit'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

describe('sendEmailToMany paced study-reminder path', () => {
  beforeEach(() => {
    resetResendSendPaceForTests(0)
    fetchMock.mockReset()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.EMAIL_FROM = 'noreply@example.com'
  })

  afterEach(() => {
    resetResendSendPaceForTests(0)
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
  })

  it('sends recipients sequentially with spacing and continues after 429', async () => {
    vi.useFakeTimers()
    const { sendEmailToMany } = await import('@/lib/email/send')

    const startTimes: number[] = []
    let inFlight = 0
    let maxInFlight = 0

    fetchMock.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      startTimes.push(Date.now())
      const callIndex = startTimes.length
      inFlight -= 1
      if (callIndex === 2) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => '1' },
          text: async () => JSON.stringify({ message: 'Too many requests' }),
        }
      }
      if (callIndex === 3) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          text: async () => JSON.stringify({ message: 'unavailable' }),
        }
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
      }
    })

    const promise = sendEmailToMany(
      ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'],
      {
        subject: '【受験生web】本日の学習記録が未入力です',
        text: 'body',
      },
      { omitRecipientFromLogs: true, pace: true },
    )

    await vi.runAllTimersAsync()
    const result = await promise

    expect(maxInFlight).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.sentCount).toBe(2)
    expect(result.rateLimitedCount).toBe(1)
    expect(result.failedCount).toBe(2)
    expect(JSON.stringify(result)).not.toContain('example.com')

    for (let i = 1; i < startTimes.length; i += 1) {
      expect(startTimes[i]! - startTimes[i - 1]!).toBeGreaterThanOrEqual(
        RESEND_SEND_MIN_INTERVAL_MS,
      )
    }

    // No Retry-After or addresses in fetch auth leakage checks via logged args
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as { body?: string; headers?: Record<string, string> }
      expect(init.headers?.Authorization).toMatch(/^Bearer /)
      expect(JSON.stringify(init.body)).not.toContain('Retry-After')
    }

    vi.useRealTimers()
  })

  it('does not automatically retry a failed recipient', async () => {
    vi.useFakeTimers()
    const { sendEmailToMany } = await import('@/lib/email/send')

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{}',
    })

    const promise = sendEmailToMany(
      ['a@example.com'],
      { subject: 's', text: 't' },
      { omitRecipientFromLogs: true, pace: true },
    )
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.rateLimitedCount).toBe(1)
    expect(result.sentCount).toBe(0)

    vi.useRealTimers()
  })

  it('keeps unpaced Promise.all behavior for other email features', async () => {
    const { sendEmailToMany } = await import('@/lib/email/send')
    let inFlight = 0
    let maxInFlight = 0

    fetchMock.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { ok: true, status: 200, text: async () => '' }
    })

    await sendEmailToMany(
      ['a@example.com', 'b@example.com', 'c@example.com'],
      { subject: 's', text: 't' },
    )

    expect(maxInFlight).toBeGreaterThan(1)
  })
})
