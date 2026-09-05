import { describe, expect, it } from 'vitest'
import * as studyReminderCronRoute from '@/app/api/cron/study-reminder/route'
import { STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS } from '@/lib/study/study-reminder-duration'

describe('GET /api/cron/study-reminder route config', () => {
  it('keeps Node.js runtime and maxDuration 60', () => {
    expect(studyReminderCronRoute.runtime).toBe('nodejs')
    expect(studyReminderCronRoute.maxDuration).toBe(60)
    expect(studyReminderCronRoute.maxDuration).toBe(
      STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS,
    )
  })
})
