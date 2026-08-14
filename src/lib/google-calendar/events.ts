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
}): Promise<void> {
  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; event skipped')
    return
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
    return
  }

  const studentName = student ? getPersonName(student) : '生徒'
  const coachName = coach?.name ?? '未設定'

  try {
    await client.calendar.events.insert({
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
  } catch (error) {
    console.error('[google-calendar] event insert failed:', error)
  }
}
