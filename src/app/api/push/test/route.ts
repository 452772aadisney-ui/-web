import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJsonContentType, verifyRequestOrigin } from '@/lib/push/origin'
import {
  parsePushSubscriptionInput,
  readJsonBodyLimited,
} from '@/lib/push/subscription-input'
import {
  TEST_NOTIFICATION_COOLDOWN_MS,
  isPushSendingAvailable,
} from '@/lib/push/send-config'
import {
  findActiveSubscriptionForUserKeys,
  getLatestTestNotificationAt,
  sendPushNotification,
} from '@/lib/push/send-service'
import type { Profile } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store',
} as const

const TEST_TITLE = '受験生web'
const TEST_BODY = '通知を受け取れる状態です。'
const TEST_PATH = '/dashboard/notifications'

function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: NO_STORE },
  )
}

async function requireStudentUser(): Promise<
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

  if (!profile || profile.role !== 'student') {
    return { ok: false, response: jsonError(403, 'forbidden') }
  }

  return { ok: true, userId: user.id }
}

function buildCooldownIdempotencyKey(nowMs: number): string {
  const bucket = Math.floor(nowMs / TEST_NOTIFICATION_COOLDOWN_MS)
  return `cooldown:${bucket}`
}

function secondsUntilNextBucket(nowMs: number): number {
  const bucketEnd =
    (Math.floor(nowMs / TEST_NOTIFICATION_COOLDOWN_MS) + 1) *
    TEST_NOTIFICATION_COOLDOWN_MS
  return Math.max(1, Math.ceil((bucketEnd - nowMs) / 1000))
}

/**
 * Send a fixed test notification to the current browser subscription only.
 * Body must include the current PushSubscription JSON (endpoint + keys).
 */
export async function POST(request: Request) {
  const origin = verifyRequestOrigin(request)
  if (!origin.ok) {
    return jsonError(403, 'forbidden')
  }
  if (!isJsonContentType(request)) {
    return jsonError(415, 'unsupported_media_type')
  }

  const auth = await requireStudentUser()
  if (!auth.ok) return auth.response

  if (!isPushSendingAvailable()) {
    return jsonError(503, 'sending_unavailable')
  }

  const body = await readJsonBodyLimited(request)
  if (!body.ok) {
    return jsonError(400, body.code)
  }

  const parsed = parsePushSubscriptionInput(body.value)
  if (!parsed.ok) {
    return jsonError(400, parsed.code)
  }

  const nowMs = Date.now()
  const latest = await getLatestTestNotificationAt(auth.userId)
  if (!latest.ok) {
    return jsonError(500, 'internal_error')
  }
  if (latest.createdAt) {
    const elapsed = nowMs - new Date(latest.createdAt).getTime()
    if (elapsed >= 0 && elapsed < TEST_NOTIFICATION_COOLDOWN_MS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((TEST_NOTIFICATION_COOLDOWN_MS - elapsed) / 1000),
      )
      return jsonError(429, 'rate_limited', { retryAfterSeconds })
    }
  }

  const matched = await findActiveSubscriptionForUserKeys({
    userId: auth.userId,
    endpoint: parsed.value.endpoint,
    p256dh: parsed.value.keys.p256dh,
    auth: parsed.value.keys.auth,
  })

  if (!matched.ok) {
    if (matched.code === 'not_found') {
      return jsonError(404, 'subscription_not_found')
    }
    if (matched.code === 'admin_unavailable') {
      return jsonError(503, 'sending_unavailable')
    }
    return jsonError(500, 'internal_error')
  }

  const idempotencyKey = buildCooldownIdempotencyKey(nowMs)

  const result = await sendPushNotification({
    userId: auth.userId,
    notificationType: 'test',
    idempotencyKey,
    title: TEST_TITLE,
    body: TEST_BODY,
    targetPath: TEST_PATH,
    subscriptionIds: [matched.subscriptionId],
    tag: 'test-notification',
  })

  if (!result.ok) {
    if (result.code === 'disabled' || result.code === 'not_configured') {
      return jsonError(503, 'sending_unavailable')
    }
    if (result.code === 'no_subscriptions') {
      return jsonError(404, 'subscription_not_found')
    }
    return jsonError(500, 'internal_error')
  }

  // Same cooldown window: event already existed and was fully skipped → treat as rate limit.
  if (!result.eventCreated && result.sent === 0 && result.skipped > 0) {
    return jsonError(429, 'rate_limited', {
      retryAfterSeconds: secondsUntilNextBucket(nowMs),
    })
  }

  if (result.sent === 0 && result.failed > 0) {
    return jsonError(502, 'send_failed')
  }

  if (result.sent === 0) {
    return jsonError(500, 'internal_error')
  }

  return NextResponse.json(
    {
      ok: true,
      sent: result.sent,
    },
    { status: 200, headers: NO_STORE },
  )
}
