/**
 * Admin-facing coaching reminder readiness dry-run (read-only).
 */

import { isAdminNotificationTestEnabled } from '@/lib/admin/notification-test-config'
import {
  beginAdminFullDryRun,
  endAdminFullDryRun,
} from '@/lib/admin/notification-test-dry-run-gate'
import {
  dryRunGateKey,
  resolveAdminDryRunAudienceScope,
} from '@/lib/admin/dry-run-student-scope'
import {
  evaluateCoachingAdminDryRunReport,
  type CoachingAdminDryRunReport,
} from '@/lib/coaching/coaching-reminder-dry-run'

export type AdminCoachingDryRunResult =
  | { ok: true; report: CoachingAdminDryRunReport }
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

export async function runAdminCoachingReminderDryRun(params: {
  adminUserId: string
  isSuperAdmin: boolean
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AdminCoachingDryRunResult> {
  const env = params.env ?? process.env

  if (!isAdminNotificationTestEnabled(env)) {
    return { ok: false, code: 'feature_disabled' }
  }

  const audienceScope = resolveAdminDryRunAudienceScope(params.isSuperAdmin)
  const gateKey = dryRunGateKey(params.adminUserId, audienceScope)
  const gate = beginAdminFullDryRun(gateKey)
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      retryAfterSeconds: gate.retryAfterSeconds,
    }
  }

  try {
    const evaluated = await evaluateCoachingAdminDryRunReport({
      env,
      excludeGraduates: audienceScope === 'enrolled',
    })
    if (!evaluated.ok) {
      return { ok: false, code: evaluated.code }
    }
    return { ok: true, report: evaluated.report }
  } finally {
    endAdminFullDryRun(gateKey)
  }
}
