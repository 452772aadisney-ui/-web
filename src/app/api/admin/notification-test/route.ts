import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJsonContentType, verifyRequestOrigin } from '@/lib/push/origin'
import {
  isAdminNotificationTestEnabled,
  resolveAdminCategoryTestKind,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'
import {
  inspectAdminNotificationTestTarget,
  listAdminNotificationTestTargets,
  sendAdminNotificationTestEmail,
  sendAdminNotificationTestPush,
} from '@/lib/admin/notification-test-service'
import { runAdminFullStudyReminderDryRun } from '@/lib/admin/notification-test-full-dry-run'
import { runAdminAnnouncementDeliveryDryRun } from '@/lib/admin/notification-test-announcement-dry-run'
import { runAdminMessageDeliveryDryRun } from '@/lib/admin/notification-test-message-dry-run'
import { runAdminCoachingReminderDryRun } from '@/lib/admin/notification-test-coaching-dry-run'
import { loadNotificationOpsSnapshot } from '@/lib/admin/notification-ops-snapshot'
import {
  inspectAdminStudyReminderIntegration,
  sendAdminStudyReminderIntegrationTest,
} from '@/lib/admin/notification-test-study-reminder-integration'
import type { Profile } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE })
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE })
}

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: jsonError(401, 'unauthorized') }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'role'>>()

  if (!profile || profile.role !== 'admin') {
    return { ok: false, response: jsonError(403, 'forbidden') }
  }

  return { ok: true, userId: user.id }
}

/** Bootstrap: feature flags + allowlisted test targets (labels only). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const availability = resolveAdminNotificationTestAvailability()
  const listed = await listAdminNotificationTestTargets()

  if (!listed.ok) {
    return jsonError(500, 'internal_error')
  }

  return json({
    featureAvailable: listed.featureAvailable,
    disabledReason: listed.featureAvailable ? null : listed.reason,
    flagEnabled: isAdminNotificationTestEnabled(),
    targets: listed.featureAvailable ? listed.targets : [],
  })
}

type PostBody = {
  action?: unknown
  targetUserId?: unknown
  category?: unknown
}

/**
 * Actions: ops-snapshot | inspect | push | email | full-dry-run |
 * announcement-dry-run | message-dry-run | coaching-dry-run
 * Never accepts title/body/path/notificationType from the client.
 * Dry-run / ops-snapshot do not use NOTIFICATION_TEST_USER_IDS.
 */
export async function POST(request: Request) {
  const origin = verifyRequestOrigin(request)
  if (!origin.ok) return jsonError(403, 'forbidden')
  if (!isJsonContentType(request)) return jsonError(415, 'unsupported_media_type')

  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return jsonError(400, 'invalid_json')
  }

  const action = body.action

  if (action === 'ops-snapshot') {
    const result = await loadNotificationOpsSnapshot()
    if (!result.ok) {
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'ops_snapshot_failed')
    }
    return json({
      ok: true,
      snapshot: result.snapshot,
      notice: 'read_only_no_notifications_sent',
    })
  }

  if (action === 'study-reminder-inspect') {
    const targetUserId =
      typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
    if (!targetUserId) return jsonError(400, 'invalid_target')

    const result = await inspectAdminStudyReminderIntegration({ targetUserId })
    if (!result.ok) {
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'forbidden_target') return jsonError(403, 'forbidden')
      if (result.code === 'invalid_target') return jsonError(400, 'invalid_target')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'internal_error')
    }
    return json({ ok: true, studyReminderInspect: result.inspect })
  }

  if (action === 'study-reminder-send') {
    const targetUserId =
      typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
    if (!targetUserId) return jsonError(400, 'invalid_target')

    const result = await sendAdminStudyReminderIntegrationTest({
      adminUserId: auth.userId,
      targetUserId,
    })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: result.skippedReason ?? null,
          failed: Boolean(result.failed),
        })
      }
      if (result.code === 'in_progress') return jsonError(409, 'in_progress')
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'forbidden_target') return jsonError(403, 'forbidden')
      if (result.code === 'invalid_target') return jsonError(400, 'invalid_target')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(502, 'send_failed', {
        sent: false,
        pushSent: false,
        emailSent: false,
        skippedReason: null,
        failed: true,
      })
    }

    return json({
      ok: true,
      sent: result.sent,
      pushSent: result.pushSent,
      emailSent: result.emailSent,
      skippedReason: result.skippedReason,
      failed: result.failed,
    })
  }

  if (action === 'full-dry-run') {
    const result = await runAdminFullStudyReminderDryRun({ adminUserId: auth.userId })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
        })
      }
      if (result.code === 'in_progress') {
        return jsonError(409, 'in_progress')
      }
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'dry_run_failed')
    }

    // Counts only — never user IDs, names, emails, or endpoints.
    return json({
      ok: true,
      dryRun: result.report,
      sumConsistent: result.sumConsistent,
      notice: 'evaluation_only_no_notifications_sent',
    })
  }

  if (action === 'announcement-dry-run') {
    const result = await runAdminAnnouncementDeliveryDryRun({ adminUserId: auth.userId })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
        })
      }
      if (result.code === 'in_progress') {
        return jsonError(409, 'in_progress')
      }
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'dry_run_failed')
    }

    return json({
      ok: true,
      announcementDryRun: result.report,
      notice: 'evaluation_only_no_notifications_sent',
    })
  }

  if (action === 'message-dry-run') {
    const result = await runAdminMessageDeliveryDryRun({ adminUserId: auth.userId })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
        })
      }
      if (result.code === 'in_progress') {
        return jsonError(409, 'in_progress')
      }
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'dry_run_failed')
    }

    return json({
      ok: true,
      messageDryRun: result.report,
      notice: 'evaluation_only_no_notifications_sent',
    })
  }

  if (action === 'coaching-dry-run') {
    const result = await runAdminCoachingReminderDryRun({ adminUserId: auth.userId })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
        })
      }
      if (result.code === 'in_progress') {
        return jsonError(409, 'in_progress')
      }
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'dry_run_failed')
    }

    return json({
      ok: true,
      coachingDryRun: result.report,
      notice: 'evaluation_only_no_notifications_sent',
    })
  }

  const targetUserId =
    typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''

  if (action !== 'inspect' && action !== 'push' && action !== 'email') {
    return jsonError(400, 'invalid_action')
  }
  if (!targetUserId) {
    return jsonError(400, 'invalid_target')
  }

  const category =
    body.category === undefined || body.category === null
      ? 'study_reminder'
      : resolveAdminCategoryTestKind(body.category)
  if (!category) {
    return jsonError(400, 'invalid_category')
  }

  if (action === 'inspect') {
    const result = await inspectAdminNotificationTestTarget({ targetUserId })
    if (!result.ok) {
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'forbidden_target') return jsonError(403, 'forbidden')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(500, 'internal_error')
    }
    return json({ ok: true, inspect: result.inspect })
  }

  if (action === 'push') {
    const result = await sendAdminNotificationTestPush({
      adminUserId: auth.userId,
      targetUserId,
      category,
    })
    if (!result.ok) {
      if (result.code === 'rate_limited') {
        return jsonError(429, 'rate_limited', {
          retryAfterSeconds: result.retryAfterSeconds,
        })
      }
      if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
      if (result.code === 'push_disabled') return jsonError(503, 'push_disabled')
      if (result.code === 'forbidden_target') return jsonError(403, 'forbidden')
      if (result.code === 'no_subscriptions') return jsonError(409, 'no_subscriptions')
      if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
      return jsonError(502, 'send_failed')
    }
    return json({ ok: true, sent: result.sent, category })
  }

  const result = await sendAdminNotificationTestEmail({
    adminUserId: auth.userId,
    targetUserId,
    category,
  })
  if (!result.ok) {
    if (result.code === 'rate_limited') {
      return jsonError(429, 'rate_limited', {
        retryAfterSeconds: result.retryAfterSeconds,
      })
    }
    if (result.code === 'feature_disabled') return jsonError(503, 'feature_disabled')
    if (result.code === 'forbidden_target') return jsonError(403, 'forbidden')
    if (result.code === 'no_email') return jsonError(409, 'no_email')
    if (result.code === 'email_not_configured') return jsonError(503, 'email_not_configured')
    if (result.code === 'admin_unavailable') return jsonError(503, 'unavailable')
    return jsonError(502, 'send_failed')
  }
  return json({ ok: true, category })
}
