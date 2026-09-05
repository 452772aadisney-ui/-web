/**
 * Admin-facing full study-reminder dry-run (read-only aggregate).
 * Does not send notifications or write notification tables.
 */

import { isAdminNotificationTestEnabled } from '@/lib/admin/notification-test-config'
import {
  beginAdminFullDryRun,
  endAdminFullDryRun,
} from '@/lib/admin/notification-test-dry-run-gate'
import {
  assertCurrentEffectiveSum,
  assertPushReadinessSum,
  evaluateAdminFullDryRunReport,
  type AdminFullDryRunReport,
} from '@/lib/study/study-reminder-dry-run'

export type AdminFullDryRunResult =
  | {
      ok: true
      report: AdminFullDryRunReport
      sumConsistent: { readiness: boolean; current: boolean }
    }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'rate_limited'
        | 'in_progress'
        | 'admin_unavailable'
        | 'query_failed'
      retryAfterSeconds?: number
    }

/**
 * Evaluate all students with dual readiness / current-effective aggregates.
 * Gated by ADMIN_NOTIFICATION_TEST_ENABLED only (not NOTIFICATION_TEST_USER_IDS).
 */
export async function runAdminFullStudyReminderDryRun(params: {
  adminUserId: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AdminFullDryRunResult> {
  const env = params.env ?? process.env

  if (!isAdminNotificationTestEnabled(env)) {
    return { ok: false, code: 'feature_disabled' }
  }

  const gate = beginAdminFullDryRun(params.adminUserId)
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      retryAfterSeconds: gate.retryAfterSeconds,
    }
  }

  try {
    const evaluated = await evaluateAdminFullDryRunReport({ env })
    if (!evaluated.ok) {
      return { ok: false, code: evaluated.code }
    }

    return {
      ok: true,
      report: evaluated.report,
      sumConsistent: {
        readiness: assertPushReadinessSum(evaluated.report.readiness),
        current: assertCurrentEffectiveSum(evaluated.report.current),
      },
    }
  } finally {
    endAdminFullDryRun(params.adminUserId)
  }
}
