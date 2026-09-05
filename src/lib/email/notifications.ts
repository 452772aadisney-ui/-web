import { getPersonName } from '@/lib/auth/display-name'
import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmailToMany } from '@/lib/email/send'
import { getStudyFeedbackStamp } from '@/lib/study/feedback'
import type { DailyStudyDigestReport } from '@/lib/study/digest'
import { deliverAnnouncementNotifications } from '@/lib/announcements/announcement-orchestrator'
import { createClient } from '@/lib/supabase/server'
import {
  STUDY_REMINDER_EMAIL_SUBJECT,
  buildMissingStudyLogEmailText,
} from '@/lib/study/study-reminder-email'

async function fetchAdminEmails(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('email').eq('role', 'admin')

  if (error) {
    console.error('[email] admin emails query failed:', error.message)
    return []
  }

  return ((data ?? []) as Array<{ email: string }>)
    .map((row) => row.email.trim())
    .filter(Boolean)
}

function truncatePreview(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

/**
 * @deprecated Prefer deliverAnnouncementNotifications (mode-aware Push-first).
 * Kept as a thin wrapper for callers that still expect the old name.
 */
export async function notifyStudentsOfNewAnnouncement(input: {
  announcementId: string
  title: string
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
}): Promise<void> {
  await deliverAnnouncementNotifications(input)
}

export async function notifyChatMessageReceived(input: {
  studentId: string
  senderId: string
  senderRole: 'student' | 'admin'
  body: string
}): Promise<void> {
  const preview = truncatePreview(input.body)
  const baseUrl = getAppBaseUrl()

  // Admin → student student-facing mail is handled by deliverStudentMessageNotification.
  // This function retains student → admin fanout (and any legacy admin callers).
  if (input.senderRole === 'admin') {
    const supabase = await createClient()
    const { data: student } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', input.studentId)
      .maybeSingle<{ email: string }>()

    const email = student?.email?.trim()
    if (!email) return

    await sendEmailToMany([email], {
      subject: '【受験生web】管理者からメッセージが届きました',
      text: [
        '管理者から新しいメッセージが届きました。',
        '',
        preview,
        '',
        `確認する: ${baseUrl}/dashboard/chat/room`,
      ].join('\n'),
      pace: true,
      omitRecipientFromLogs: true,
    })
    return
  }

  const [admins, studentProfile] = await Promise.all([
    fetchAdminEmails(),
    (async () => {
      const supabase = await createClient()
      const { data } = await supabase
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', input.studentId)
        .maybeSingle<{ full_name: string; display_name: string }>()
      return data
    })(),
  ])

  if (admins.length === 0) return

  const studentName = studentProfile ? getPersonName(studentProfile) : '生徒'

  await sendEmailToMany(admins, {
    subject: `【受験生web】${studentName}さんからメッセージが届きました`,
    text: [
      `${studentName}さんから新しいメッセージが届きました。`,
      '',
      preview,
      '',
      `確認する: ${baseUrl}/admin/chat/${input.studentId}`,
    ].join('\n'),
  })
}

export async function notifyStudyFeedbackReceived(input: {
  studentId: string
  studiedOn: string
  stamp: string
  comment: string
}): Promise<void> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', input.studentId)
    .maybeSingle<{ email: string }>()

  const email = student?.email?.trim()
  if (!email) return

  const stamp = getStudyFeedbackStamp(input.stamp)
  const baseUrl = getAppBaseUrl()
  const url = `${baseUrl}/dashboard/study/history?date=${input.studiedOn}`

  const lines = [
    '学習履歴に先生からフィードバックが届きました。',
    '',
    `対象日: ${input.studiedOn}`,
    `スタンプ: ${stamp?.emoji ?? ''} ${stamp?.label ?? ''}`,
  ]

  if (input.comment.trim()) {
    lines.push('', input.comment.trim())
  }

  lines.push('', `確認する: ${url}`)

  await sendEmailToMany([email], {
    subject: '【受験生web】学習記録にコメントが届きました',
    text: lines.join('\n'),
  })
}

export async function notifyStudentsMissingTodayStudyLog(
  report: DailyStudyDigestReport,
  options?: { deadlineMs?: number },
): Promise<{
  recipientCount: number
  sentCount: number
  skippedCount: number
  failedCount: number
  rateLimitedCount: number
  unprocessedCount: number
  timedOut: boolean
}> {
  const emails = report.notRecorded
    .map((student) => student.email?.trim())
    .filter((email): email is string => Boolean(email))

  return sendEmailToMany(
    emails,
    {
      subject: STUDY_REMINDER_EMAIL_SUBJECT,
      text: buildMissingStudyLogEmailText(report.dateLabel),
    },
    {
      omitRecipientFromLogs: true,
      pace: true,
      deadlineMs: options?.deadlineMs,
    },
  )
}
