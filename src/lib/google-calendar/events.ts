import { getPersonName } from '@/lib/auth/display-name'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'
import { shiftDateKey } from '@/lib/study/dates'
import { createClient } from '@/lib/supabase/server'

function buildEventDescription(coachName: string, studentNote: string): string {
  const lines = [`担当: ${coachName}`, '']

  if (studentNote.trim()) {
    lines.push('伝達事項:', studentNote.trim())
  } else {
    lines.push('伝達事項: なし')
  }

  return lines.join('\n')
}

export async function createCoachingBookingCalendarEvent(input: {
  studentId: string
  slotId: string
  coachId: string
  startsAt: string
  studentNote: string
}): Promise<string | null> {
  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; event skipped')
    return null
  }

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
      .select('ends_at')
      .eq('id', input.slotId)
      .maybeSingle<{ ends_at: string }>(),
  ])

  if (!slot?.ends_at) {
    console.error('[google-calendar] slot end time not found:', input.slotId)
    return null
  }

  const studentName = student ? getPersonName(student) : '生徒'
  const coachName = coach?.name ?? '未設定'

  try {
    const response = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: `【コーチング】${studentName}さん`,
        description: buildEventDescription(coachName, input.studentNote),
        start: {
          dateTime: input.startsAt,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: slot.ends_at,
          timeZone: 'Asia/Tokyo',
        },
      },
    })

    return response.data.id ?? null
  } catch (error) {
    console.error('[google-calendar] event insert failed:', error)
    return null
  }
}

export async function deleteCoachingBookingCalendarEvent(
  eventId: string | null | undefined,
): Promise<void> {
  const trimmed = eventId?.trim()
  if (!trimmed) return

  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; delete skipped')
    return
  }

  try {
    await client.calendar.events.delete({
      calendarId: client.calendarId,
      eventId: trimmed,
    })
  } catch (error) {
    console.error('[google-calendar] event delete failed:', error)
  }
}

export async function updateCoachingBookingCalendarEvent(input: {
  eventId: string
  studentId: string
  coachId: string
  startsAt: string
  endsAt: string
  studentNote: string
}): Promise<void> {
  const trimmed = input.eventId.trim()
  if (!trimmed) return

  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; update skipped')
    return
  }

  const supabase = await createClient()

  const [{ data: student }, { data: coach }] = await Promise.all([
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
  ])

  const studentName = student ? getPersonName(student) : '生徒'
  const coachName = coach?.name ?? '未設定'

  try {
    await client.calendar.events.patch({
      calendarId: client.calendarId,
      eventId: trimmed,
      requestBody: {
        summary: `【コーチング】${studentName}さん`,
        description: buildEventDescription(coachName, input.studentNote),
        start: {
          dateTime: input.startsAt,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: input.endsAt,
          timeZone: 'Asia/Tokyo',
        },
      },
    })
  } catch (error) {
    console.error('[google-calendar] event patch failed:', error)
  }
}

function buildQuizEventDescription(input: {
  subject: string
  studentNames: string[]
  note: string
}): string {
  const lines = [
    input.subject ? `科目: ${input.subject}` : '科目: 未設定',
    '',
    '対象生徒:',
    input.studentNames.length > 0 ? input.studentNames.join('、') : 'なし',
  ]

  if (input.note.trim()) {
    lines.push('', 'メモ:', input.note.trim())
  }

  return lines.join('\n')
}

async function fetchStudentNames(studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', studentIds)

  return (data ?? [])
    .map((profile) => getPersonName(profile as { full_name: string; display_name: string }))
    .sort((a, b) => a.localeCompare(b, 'ja'))
}

export async function createQuizCalendarEvent(input: {
  title: string
  subject: string
  scheduledOn: string
  note: string
  studentIds: string[]
}): Promise<string | null> {
  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; quiz event skipped')
    return null
  }

  const studentNames = await fetchStudentNames(input.studentIds)
  const endDate = shiftDateKey(input.scheduledOn, 1)

  try {
    const response = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: `【小テスト】${input.title}`,
        description: buildQuizEventDescription({
          subject: input.subject,
          studentNames,
          note: input.note,
        }),
        start: { date: input.scheduledOn },
        end: { date: endDate },
      },
    })

    return response.data.id ?? null
  } catch (error) {
    console.error('[google-calendar] quiz event insert failed:', error)
    return null
  }
}

export async function updateQuizCalendarEvent(input: {
  eventId: string
  title: string
  subject: string
  scheduledOn: string
  note: string
  studentIds: string[]
}): Promise<void> {
  const trimmed = input.eventId.trim()
  if (!trimmed) return

  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; quiz update skipped')
    return
  }

  const studentNames = await fetchStudentNames(input.studentIds)
  const endDate = shiftDateKey(input.scheduledOn, 1)

  try {
    await client.calendar.events.patch({
      calendarId: client.calendarId,
      eventId: trimmed,
      requestBody: {
        summary: `【小テスト】${input.title}`,
        description: buildQuizEventDescription({
          subject: input.subject,
          studentNames,
          note: input.note,
        }),
        start: { date: input.scheduledOn },
        end: { date: endDate },
      },
    })
  } catch (error) {
    console.error('[google-calendar] quiz event patch failed:', error)
  }
}

export async function deleteQuizCalendarEvent(eventId: string | null | undefined): Promise<void> {
  await deleteCoachingBookingCalendarEvent(eventId)
}
