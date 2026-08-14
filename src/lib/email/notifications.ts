import { getPersonName } from '@/lib/auth/display-name'
import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmailToMany } from '@/lib/email/send'
import {
  buildProfileTagMap,
  resolveAnnouncementAudience,
} from '@/lib/announcements/audience'
import { createClient } from '@/lib/supabase/server'
import { fetchStudentList } from '@/lib/study/queries'

async function fetchProfileTagAssignments(): Promise<Array<{ profile_id: string; tag_id: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profile_student_tags').select('profile_id, tag_id')

  if (error) {
    console.error('[email] profile tags query failed:', error.message)
    return []
  }

  return (data ?? []) as Array<{ profile_id: string; tag_id: string }>
}

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

export async function notifyStudentsOfNewAnnouncement(input: {
  announcementId: string
  title: string
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
}): Promise<void> {
  const [students, tagAssignments] = await Promise.all([
    fetchStudentList(),
    fetchProfileTagAssignments(),
  ])

  const studentSummaries = students.map((student) => ({
    id: student.id,
    full_name: student.full_name,
    display_name: student.display_name,
  }))

  const audience = resolveAnnouncementAudience(
    {
      id: input.announcementId,
      title: input.title,
      body: '',
      created_at: '',
      updated_at: '',
      created_by: null,
      target_all: input.targetAll,
      target_tag_ids: input.tagIds,
      target_student_ids: input.studentIds,
    },
    studentSummaries,
    buildProfileTagMap(tagAssignments),
  )

  const audienceIds = new Set(audience.map((student) => student.id))
  const emails = students
    .filter((student) => audienceIds.has(student.id))
    .map((student) => student.email.trim())
    .filter(Boolean)

  console.info('[email] announcement notification:', {
    announcementId: input.announcementId,
    audienceCount: audience.length,
    emailCount: emails.length,
    configured: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()),
  })

  if (audience.length > 0 && emails.length === 0) {
    console.warn('[email] audience exists but no student emails were found in profiles')
  }

  const url = `${getAppBaseUrl()}/dashboard/announcements/${input.announcementId}`

  await sendEmailToMany(emails, {
    subject: `【受験生web】新しいお知らせ: ${input.title}`,
    text: [
      '新しいお知らせが配信されました。',
      '',
      input.title,
      '',
      `確認する: ${url}`,
    ].join('\n'),
  })
}

export async function notifyChatMessageReceived(input: {
  studentId: string
  senderId: string
  senderRole: 'student' | 'admin'
  body: string
}): Promise<void> {
  const preview = truncatePreview(input.body)
  const baseUrl = getAppBaseUrl()

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
