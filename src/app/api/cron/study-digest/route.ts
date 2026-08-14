import { NextResponse } from 'next/server'
import { notifyDailyStudyDigest } from '@/lib/discord/notifications'
import { buildDailyStudyDigestReport, getYesterdayDateKeyJst } from '@/lib/study/digest'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dateKey = getYesterdayDateKeyJst()
  const report = await buildDailyStudyDigestReport(dateKey)

  if (!report) {
    return NextResponse.json({ error: 'Digest build failed' }, { status: 500 })
  }

  await notifyDailyStudyDigest(report)

  return NextResponse.json({
    ok: true,
    dateKey,
    recordedCount: report.recorded.length,
    notRecordedCount: report.notRecorded.length,
  })
}
