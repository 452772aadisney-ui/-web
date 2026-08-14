import { getPersonName } from '@/lib/auth/display-name'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'
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
