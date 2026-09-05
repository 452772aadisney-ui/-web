import { NextResponse } from 'next/server'
import {
  runCoachingBookingPromptJob,
  toPublicBookingPromptSummary,
} from '@/lib/coaching/coaching-booking-prompt-orchestrator'

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
 * Vercel Cron: 0 3 * * 1 (UTC) = Monday 12:00–12:59 JST (Hobby: somewhere in the hour).
 * Auth: Authorization Bearer CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  const result = await runCoachingBookingPromptJob()

  if (!result.ok) {
    console.error('[coaching-booking-reminder] candidate build failed')
    return NextResponse.json(
      { error: 'Booking prompt build failed' },
      { status: 500, headers: NO_STORE },
    )
  }

  const body = toPublicBookingPromptSummary(result.summary)
  console.info('[coaching-booking-reminder] completed', body)

  return NextResponse.json(body, { status: 200, headers: NO_STORE })
}
