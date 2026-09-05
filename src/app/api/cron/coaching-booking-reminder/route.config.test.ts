import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as bookingCron from '@/app/api/cron/coaching-booking-reminder/route'
import * as sessionCron from '@/app/api/cron/coaching-session-reminder/route'
import { COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS } from '@/lib/coaching/coaching-reminder-mode'

describe('coaching reminder cron routes', () => {
  it('booking reminder keeps nodejs + maxDuration 60', () => {
    expect(bookingCron.runtime).toBe('nodejs')
    expect(bookingCron.maxDuration).toBe(60)
    expect(bookingCron.maxDuration).toBe(COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS)
  })

  it('session reminder keeps nodejs + maxDuration 60', () => {
    expect(sessionCron.runtime).toBe('nodejs')
    expect(sessionCron.maxDuration).toBe(60)
  })

  it('registers both crons in vercel.json with expected schedules', () => {
    const vercelJson = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> }
    expect(vercelJson.crons).toEqual(
      expect.arrayContaining([
        {
          path: '/api/cron/coaching-booking-reminder',
          schedule: '0 3 * * 1',
        },
        {
          path: '/api/cron/coaching-session-reminder',
          schedule: '0 11 * * *',
        },
      ]),
    )
  })
})
