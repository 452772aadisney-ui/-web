/**
 * Admin-facing class-schedule notification readiness dry-run (read-only).
 * Audience is 既卒 by design — callers must require super admin before invoke.
 */

import { isAdminNotificationTestEnabled } from '@/lib/admin/notification-test-config'
import {
  beginAdminFullDryRun,
  endAdminFullDryRun,
} from '@/lib/admin/notification-test-dry-run-gate'
import { dryRunGateKey } from '@/lib/admin/dry-run-student-scope'
import {
  evaluateClassScheduleAdminDryRunReport,
  type ClassScheduleAdminDryRunReport,
} from '@/lib/class-schedule/class-schedule-dry-run'

export type AdminClassScheduleDryRunResult =
  | {
      ok: true
      report: ClassScheduleAdminDryRunReport
    }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'rate_limited'
        | 'in_progress'
        | 'admin_unavailable'
        | 'query_failed'
        | 'super_admin_required'
      retryAfterSeconds?: number
    }

export async function runAdminClassScheduleDeliveryDryRun(params: {
  adminUserId: string
  isSuperAdmin: boolean
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AdminClassScheduleDryRunResult> {
  const env = params.env ?? process.env

  if (!params.isSuperAdmin) {
    return { ok: false, code: 'super_admin_required' }
  }

  if (!isAdminNotificationTestEnabled(env)) {
    return { ok: false, code: 'feature_disabled' }
  }

  const gateKey = dryRunGateKey(params.adminUserId, 'all')
  const gate = beginAdminFullDryRun(gateKey)
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      retryAfterSeconds: gate.retryAfterSeconds,
    }
  }

  try {
    const evaluated = await evaluateClassScheduleAdminDryRunReport({ env })
    if (!evaluated.ok) {
      return { ok: false, code: evaluated.code }
    }
    return { ok: true, report: evaluated.report }
  } finally {
    endAdminFullDryRun(gateKey)
  }
}
