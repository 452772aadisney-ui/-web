import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPushConfigured } from '@/lib/push/env'
import { isJsonContentType, verifyRequestOrigin } from '@/lib/push/origin'
import {
  parsePushSubscriptionInput,
  readJsonBodyLimited,
} from '@/lib/push/subscription-input'
import {
  disablePushSubscriptionForUser,
  getPushSubscriptionStatusForUser,
  upsertPushSubscriptionForUser,
} from '@/lib/push/subscription-service'
import type { Profile } from '@/types/database'

export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store',
} as const

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE })
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

function requireMutatingGuards(request: Request): NextResponse | null {
  const origin = verifyRequestOrigin(request)
  if (!origin.ok) {
    return jsonError(403, 'forbidden')
  }
  if (!isJsonContentType(request)) {
    return jsonError(415, 'unsupported_media_type')
  }
  return null
}

/** DB status only — does not write and does not return secrets. */
export async function GET() {
  const auth = await requireStudentUser()
  if (!auth.ok) return auth.response

  const configured = isPushConfigured()
  const status = await getPushSubscriptionStatusForUser({
    userId: auth.userId,
    configured,
  })

  if ('ok' in status && status.ok === false) {
    if (status.code === 'admin_unavailable') {
      return NextResponse.json(
        { configured, subscribed: false, sendingEnabled: false },
        { status: 200, headers: NO_STORE },
      )
    }
    return jsonError(500, 'internal_error')
  }

  return NextResponse.json(status, { status: 200, headers: NO_STORE })
}

/** Register / re-sync current browser subscription (idempotent). */
export async function POST(request: Request) {
  const guard = requireMutatingGuards(request)
  if (guard) return guard

  const auth = await requireStudentUser()
  if (!auth.ok) return auth.response

  if (!isPushConfigured()) {
    return jsonError(503, 'not_configured')
  }

  const body = await readJsonBodyLimited(request)
  if (!body.ok) {
    return jsonError(400, body.code)
  }

  const parsed = parsePushSubscriptionInput(body.value)
  if (!parsed.ok) {
    return jsonError(400, parsed.code)
  }

  const result = await upsertPushSubscriptionForUser({
    userId: auth.userId,
    subscription: parsed.value,
    userAgent: request.headers.get('user-agent'),
  })

  if (!result.ok) {
    if (result.code === 'conflict') {
      return jsonError(409, 'conflict')
    }
    if (result.code === 'admin_unavailable') {
      return jsonError(503, 'not_configured')
    }
    return jsonError(500, 'internal_error')
  }

  return NextResponse.json(
    { ok: true, transferred: Boolean(result.transferred) },
    { status: 200, headers: NO_STORE },
  )
}

/** Soft-disable matching subscription for the current student. */
export async function DELETE(request: Request) {
  const guard = requireMutatingGuards(request)
  if (guard) return guard

  const auth = await requireStudentUser()
  if (!auth.ok) return auth.response

  const body = await readJsonBodyLimited(request)
  if (!body.ok) {
    return jsonError(400, body.code)
  }

  const parsed = parsePushSubscriptionInput(body.value)
  if (!parsed.ok) {
    return jsonError(400, parsed.code)
  }

  const result = await disablePushSubscriptionForUser({
    userId: auth.userId,
    subscription: parsed.value,
  })

  if (!result.ok) {
    if (result.code === 'admin_unavailable') {
      return jsonError(503, 'not_configured')
    }
    return jsonError(500, 'internal_error')
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE })
}
