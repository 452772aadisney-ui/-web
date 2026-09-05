import { describe, expect, it } from 'vitest'
import { RESEND_SEND_MIN_INTERVAL_MS } from '@/lib/email/rate-limit'
import {
  STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS,
  STUDY_REMINDER_SAFE_PACED_EMAIL_RECIPIENTS,
  assessPacedEmailDuration,
  estimatePacedEmailBudgetMs,
  estimatePacedEmailWaitMs,
} from '@/lib/study/study-reminder-duration'

describe('study-reminder duration budget', () => {
  it('keeps the Cron maxDuration constant at 60 seconds', () => {
    expect(STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS).toBe(60)
  })

  it('estimates wait-only pacing for 28 and 100 recipients', () => {
    expect(estimatePacedEmailWaitMs(28)).toBe(27 * RESEND_SEND_MIN_INTERVAL_MS)
    expect(estimatePacedEmailWaitMs(100)).toBe(99 * RESEND_SEND_MIN_INTERVAL_MS)
  })

  it('fits ~28 recipients inside soft 60s budget with assumed API latency', () => {
    const assessment = assessPacedEmailDuration(28)
    expect(assessment.waitMs).toBe(8100)
    expect(assessment.budgetMs).toBe(estimatePacedEmailBudgetMs(28))
    expect(assessment.fitsInSoftBudget).toBe(true)
    expect(assessment.fitsInMaxDuration).toBe(true)
    expect(assessment.exceedsSafeRecipientThreshold).toBe(false)
  })

  it('flags ~100 recipients as needing future batching under 60s + soft reserve', () => {
    const assessment = assessPacedEmailDuration(100)
    expect(assessment.waitMs).toBe(29_700)
    expect(assessment.budgetMs).toBeGreaterThan(assessment.softBudgetMs)
    expect(assessment.fitsInSoftBudget).toBe(false)
    expect(assessment.exceedsSafeRecipientThreshold).toBe(true)
    expect(100).toBeGreaterThan(STUDY_REMINDER_SAFE_PACED_EMAIL_RECIPIENTS)
  })
})
