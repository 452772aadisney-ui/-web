import { NextResponse } from 'next/server'
import {
  runStudyReminderJob,
  toPublicStudyReminderSummary,
} from '@/lib/study/study-reminder-orchestrator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  // Partial per-student failures are reflected in counters; return 200 so Vercel
  // Cron does not blindly re-fire the whole job (idempotent, but legacy email
  // path is not). Monitor `failed` / `emailFailed` / `stalePending` instead.
  return NextResponse.json(body, { status: 200, headers: NO_STORE })
}
