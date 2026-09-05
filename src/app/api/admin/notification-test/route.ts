import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJsonContentType, verifyRequestOrigin } from '@/lib/push/origin'
import {
  isAdminNotificationTestEnabled,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'
import {
  inspectAdminNotificationTestTarget,
  listAdminNotificationTestTargets,
  sendAdminNotificationTestEmail,
  sendAdminNotificationTestPush,
} from '@/lib/admin/notification-test-service'
import { runAdminFullStudyReminderDryRun } from '@/lib/admin/notification-test-full-dry-run'
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
}

/**
 * Actions: inspect | push | email | full-dry-run
 * Never accepts title/body/path/type from the client.
 * full-dry-run does not use NOTIFICATION_TEST_USER_IDS.
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

  const targetUserId =
    typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''

  if (action !== 'inspect' && action !== 'push' && action !== 'email') {
    return jsonError(400, 'invalid_action')
  }
  if (!targetUserId) {
    return jsonError(400, 'invalid_target')
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
    return json({ ok: true, sent: result.sent })
  }

  const result = await sendAdminNotificationTestEmail({
    adminUserId: auth.userId,
    targetUserId,
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
  return json({ ok: true })
}
