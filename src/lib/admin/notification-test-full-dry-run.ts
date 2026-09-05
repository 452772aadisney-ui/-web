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
  assertDryRunFinalSum,
  evaluateStudyReminderDryRunAggregate,
  type StudyReminderDryRunAggregate,
} from '@/lib/study/study-reminder-dry-run'

export type AdminFullDryRunResult =
  | { ok: true; aggregate: StudyReminderDryRunAggregate; sumConsistent: boolean }
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
 * Evaluate all students with the shared Cron dry-run classifier.
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
    const evaluated = await evaluateStudyReminderDryRunAggregate({ env })
    if (!evaluated.ok) {
      return { ok: false, code: evaluated.code }
    }

    return {
      ok: true,
      aggregate: evaluated.aggregate,
      sumConsistent: assertDryRunFinalSum(evaluated.aggregate),
    }
  } finally {
    endAdminFullDryRun(params.adminUserId)
  }
}
