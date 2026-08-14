import { getPersonName } from '@/lib/auth/display-name'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { sendDiscordWebhook } from '@/lib/discord/send'
import { getAppBaseUrl } from '@/lib/email/config'
import { createClient } from '@/lib/supabase/server'

function truncatePreview(text: string, maxLength = 200): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

export async function notifyCoachingBookingCreated(input: {
  studentId: string
  slotId: string
  coachId: string
  startsAt: string
  studentNote: string
}): Promise<void> {
  const supabase = await createClient()

  const [{ data: student }, { data: coach }, { data: slot }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', input.studentId)
      .maybeSingle<{ full_name: string; display_name: string }>(),
    supabase
      .from('coaching_coaches')
      .select('name')
      .eq('id', input.coachId)
      .maybeSingle<{ name: string }>(),
    supabase
      .from('coaching_slots')
      .select('ends_at, slot_date, start_time')
      .eq('id', input.slotId)
      .maybeSingle<{ ends_at: string; slot_date: string | null; start_time: string | null }>(),
  ])

  const studentName = student ? getPersonName(student) : '生徒'
  const coachName = coach?.name ?? 'コーチ'
  const datetime = slot
    ? formatCoachingBookingDateTime(
        slot.slot_date,
        slot.start_time,
        input.startsAt,
        slot.ends_at,
      )
    : new Date(input.startsAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  const lines = [
    `**生徒:** ${studentName}`,
    `**コーチ:** ${coachName}`,
    `**日時:** ${datetime}`,
  ]

  if (input.studentNote.trim()) {
    lines.push(`**メモ:** ${input.studentNote.trim()}`)
  }

  await sendDiscordWebhook({
    embeds: [
      {
        title: '新しいコーチング予約',
        description: lines.join('\n'),
        url: `${getAppBaseUrl()}/admin/coaching/bookings`,
        color: 0xf97316,
      },
    ],
  })
}

export async function notifyStudentChatMessage(input: {
  studentId: string
  body: string
}): Promise<void> {
  const supabase = await createClient()
  const { data: student } = await supabase
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', input.studentId)
    .maybeSingle<{ full_name: string; display_name: string }>()

  const studentName = student ? getPersonName(student) : '生徒'

  await sendDiscordWebhook({
    embeds: [
      {
        title: `${studentName}さんからメッセージ`,
        description: truncatePreview(input.body),
        url: `${getAppBaseUrl()}/admin/chat/${input.studentId}`,
        color: 0x2563eb,
      },
    ],
  })
}
