/**
 * Study-reminder Cron duration budgeting (read-only helpers).
 * Keeps Resend pacing (300ms) and avoids claiming success after soft timeout.
 */

import { RESEND_SEND_MIN_INTERVAL_MS } from '@/lib/email/rate-limit'

/**
 * App Router `maxDuration` for `/api/cron/study-reminder`.
 * Within Hobby (max 300s) and Pro (max 800s) Fluid Compute limits as of 2026-09.
 */
export const STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS = 60

/** Leave headroom before Vercel hard-kills the function (no response possible). */
export const STUDY_REMINDER_SOFT_TIMEOUT_RESERVE_MS = 5_000

/**
 * Conservative single-run paced-email recipient count that usually finishes
 * within 60s including API latency (~300–500ms/request). Above this, batching
 * should be planned before scaling (no queue introduced in this change).
 */
export const STUDY_REMINDER_SAFE_PACED_EMAIL_RECIPIENTS = 50

/** Assumed average Resend HTTP round-trip for budget estimates (not a hard gate). */
export const STUDY_REMINDER_ASSUMED_EMAIL_API_LATENCY_MS = 400

export function studyReminderSoftDeadlineMs(
  startedAtMs: number,
  maxDurationSeconds = STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS,
  reserveMs = STUDY_REMINDER_SOFT_TIMEOUT_RESERVE_MS,
): number {
  return startedAtMs + maxDurationSeconds * 1000 - reserveMs
}

/** Pure wait from pacing gaps only (excludes API latency). */
export function estimatePacedEmailWaitMs(recipientCount: number): number {
  if (recipientCount <= 1) return 0
  return (recipientCount - 1) * RESEND_SEND_MIN_INTERVAL_MS
}

/** Wait + assumed API latency for each send start. */
export function estimatePacedEmailBudgetMs(
  recipientCount: number,
  avgApiLatencyMs = STUDY_REMINDER_ASSUMED_EMAIL_API_LATENCY_MS,
): number {
  if (recipientCount <= 0) return 0
  return (
    estimatePacedEmailWaitMs(recipientCount) + recipientCount * avgApiLatencyMs
  )
}

export type StudyReminderEmailBudgetAssessment = {
  recipientCount: number
  waitMs: number
  budgetMs: number
  maxDurationMs: number
  softBudgetMs: number
  fitsInSoftBudget: boolean
  fitsInMaxDuration: boolean
  exceedsSafeRecipientThreshold: boolean
}

export function assessPacedEmailDuration(
  recipientCount: number,
  options?: {
    avgApiLatencyMs?: number
    maxDurationSeconds?: number
    reserveMs?: number
    safeRecipientThreshold?: number
  },
): StudyReminderEmailBudgetAssessment {
  const maxDurationSeconds =
    options?.maxDurationSeconds ?? STUDY_REMINDER_ROUTE_MAX_DURATION_SECONDS
  const reserveMs = options?.reserveMs ?? STUDY_REMINDER_SOFT_TIMEOUT_RESERVE_MS
  const maxDurationMs = maxDurationSeconds * 1000
  const softBudgetMs = maxDurationMs - reserveMs
  const waitMs = estimatePacedEmailWaitMs(recipientCount)
  const budgetMs = estimatePacedEmailBudgetMs(
    recipientCount,
    options?.avgApiLatencyMs ?? STUDY_REMINDER_ASSUMED_EMAIL_API_LATENCY_MS,
  )
  const safeThreshold =
    options?.safeRecipientThreshold ?? STUDY_REMINDER_SAFE_PACED_EMAIL_RECIPIENTS

  return {
    recipientCount,
    waitMs,
    budgetMs,
    maxDurationMs,
    softBudgetMs,
    fitsInSoftBudget: budgetMs <= softBudgetMs,
    fitsInMaxDuration: budgetMs <= maxDurationMs,
    exceedsSafeRecipientThreshold: recipientCount > safeThreshold,
  }
}
