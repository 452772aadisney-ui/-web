import { NextResponse } from 'next/server'
import { notifyStudentsMissingTodayStudyLog } from '@/lib/email/notifications'
import { buildTodayMissingStudyReport } from '@/lib/study/digest'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await buildTodayMissingStudyReport()

  if (!report) {
    return NextResponse.json({ error: 'Reminder build failed' }, { status: 500 })
  }

  const emailResult = await notifyStudentsMissingTodayStudyLog(report)

  return NextResponse.json({
    ok: true,
    dateKey: report.dateKey,
    notRecordedCount: report.notRecorded.length,
    emailRecipientCount: emailResult.recipientCount,
    emailSentCount: emailResult.sentCount,
  })
}
