import { NextResponse } from 'next/server'
import {
  runStudyReminderJob,
  toPublicStudyReminderSummary,
} from '@/lib/study/study-reminder-orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/**
 * Explicit Function duration for paced Resend sends.
 * Must be a numeric literal (Next.js rejects imported identifiers).
 * 60s is within Hobby (max 300s) and Pro (max 800s) Fluid Compute limits.
 */
export const maxDuration = 60

const NO_STORE = {
  'Cache-Control': 'no-store',
} as const

/**
 * Vercel Cron: 0 13 * * * (UTC) = 22:00 JST.
 * Auth: Authorization Bearer CRON_SECRET (unchanged).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const result = await runStudyReminderJob()

  if (!result.ok) {
    console.error('[study-reminder] candidate build failed')
    return NextResponse.json(
      { error: 'Reminder build failed' },
      { status: 500, headers: NO_STORE },
    )
  }

  const body = toPublicStudyReminderSummary(result.summary)
  console.info('[study-reminder] completed', body)

  // Always HTTP 200 after a successful candidate build so Vercel Cron does not
  // blindly re-fire (legacy email is not fully idempotent). Soft timeout /
  // partial failure is signaled via body.ok === false and counters
  // (timedOut, emailUnprocessedCount, failed, …) — never as a silent full success.
  return NextResponse.json(body, { status: 200, headers: NO_STORE })
}
