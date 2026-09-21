/**
 * Admin-facing message notification readiness dry-run (read-only).
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
  evaluateMessageAdminDryRunReport,
  type MessageAdminDryRunReport,
} from '@/lib/chat/message-dry-run'

export type AdminMessageDryRunResult =
  | { ok: true; report: MessageAdminDryRunReport }
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

export async function runAdminMessageDeliveryDryRun(params: {
  adminUserId: string
  isSuperAdmin: boolean
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AdminMessageDryRunResult> {
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
    const evaluated = await evaluateMessageAdminDryRunReport({
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
