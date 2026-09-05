import { NextResponse } from 'next/server'
import {
  runCoachingSessionReminderJob,
  toPublicSessionReminderSummary,
} from '@/lib/coaching/coaching-session-reminder-orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * Explicit Function duration for paced Resend sends.
 * Must be a numeric literal (Next.js rejects imported identifiers).
 */
export const maxDuration = 60

const NO_STORE = {
  'Cache-Control': 'no-store',
} as const

/**
 * Vercel Cron: 0 11 * * * (UTC) = 20:00–20:59 JST (Hobby: somewhere in the hour).
 * Auth: Authorization Bearer CRON_SECRET.
 * Day-before session reminder — no chat messages; notification events only on new path.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const result = await runCoachingSessionReminderJob()

  if (!result.ok) {
    console.error('[coaching-session-reminder] candidate build failed')
    return NextResponse.json(
      { error: 'Session reminder build failed' },
      { status: 500, headers: NO_STORE },
    )
  }

  const body = toPublicSessionReminderSummary(result.summary)
  console.info('[coaching-session-reminder] completed', body)

  return NextResponse.json(body, { status: 200, headers: NO_STORE })
}
