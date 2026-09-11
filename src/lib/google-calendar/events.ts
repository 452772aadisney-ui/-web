import { getPersonName } from '@/lib/auth/display-name'
import { getGoogleCalendarClient } from '@/lib/google-calendar/config'
import {
  buildCoachingCalendarExtendedProperties,
  resolveCoachingCalendarEventOwnership,
} from '@/lib/google-calendar/coaching-event-ownership'
import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'
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

export type CreatedCalendarEvent = {
  eventId: string
  etag: string | null
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: number; status?: number; response?: { status?: number } }
  return err.code === 409 || err.status === 409 || err.response?.status === 409
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: number; status?: number; response?: { status?: number } }
  return err.code === 412 || err.status === 412 || err.response?.status === 412
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: number; status?: number; response?: { status?: number } }
  return err.code === 404 || err.status === 404 || err.response?.status === 404
}

/**
 * Create-or-restore a coaching calendar event using a booking-stable event id.
 *
 * Ownership is proven by private extendedProperties.coachingBookingId and/or the
 * stable event id. Summary text alone is never sufficient.
 *
 * Cancelled events (Google): only `id` is guaranteed; private props may be gone.
 * Restore requires strong ownership (private prop or stable id). Legacy db-only
 * links are not enough to resurrect a cancelled event.
 */
export async function createCoachingBookingCalendarEvent(input: {
  bookingId: string
  studentId: string
  slotId: string
  coachId: string
  startsAt: string
  studentNote: string
  /** When set, used as legacy ownership hint (must match this booking's DB id). */
  dbEventId?: string | null
}): Promise<CreatedCalendarEvent | null> {
  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; event skipped')
    return null
  }

  let eventId: string
  try {
    eventId = coachingBookingCalendarEventId(input.bookingId)
  } catch (error) {
    console.error('[google-calendar] invalid booking id for stable event:', error)
    return null
  }

  const supabase = await createClient()

  // Refuse create/restore when the booking is no longer scheduled (stale sync).
  const { data: bookingRow } = await supabase
    .from('coaching_bookings')
    .select('status, google_calendar_event_id')
    .eq('id', input.bookingId)
    .maybeSingle<{ status: string; google_calendar_event_id: string | null }>()
  if (!bookingRow || bookingRow.status !== 'scheduled') {
    console.warn('[google-calendar] skip create/restore: booking not scheduled')
    return null
  }
  const dbEventId = input.dbEventId ?? bookingRow.google_calendar_event_id

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
  const extendedProperties = buildCoachingCalendarExtendedProperties(input.bookingId)
  const requestBody = {
    summary: `【コーチング】${studentName}さん`,
    description: buildEventDescription(coachName, input.studentNote),
    status: 'confirmed' as const,
    extendedProperties,
    start: {
      dateTime: input.startsAt,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: slot.ends_at,
      timeZone: 'Asia/Tokyo',
    },
  }

  const existing = await fetchCoachingBookingCalendarEvent(eventId)
  if (existing.status === 'ok') {
    const ownership = resolveCoachingCalendarEventOwnership({
      bookingId: input.bookingId,
      eventId,
      privateBookingId: existing.privateBookingId,
      dbEventId,
      eventStatus: existing.eventStatus,
      requireStrongOwnership: existing.eventStatus === 'cancelled',
    })
    if (!ownership.ok) {
      console.error('[google-calendar] refuse patch/restore:', ownership.reason)
      return null
    }
    return patchExistingById({
      eventId,
      requestBody,
      ifMatchEtag: existing.etag,
    })
  }
  if (existing.status === 'unconfigured') return null
  if (existing.status === 'failed') return null

  try {
    const response = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        id: eventId,
        ...requestBody,
      },
    })
    const createdId = response.data.id
    if (!createdId) return null
    return { eventId: createdId, etag: response.data.etag ?? null }
  } catch (error) {
    if (isConflict(error)) {
      const again = await fetchCoachingBookingCalendarEvent(eventId)
      if (again.status !== 'ok') {
        console.error('[google-calendar] insert conflict but get failed:', again)
        return null
      }
      const ownership = resolveCoachingCalendarEventOwnership({
        bookingId: input.bookingId,
        eventId,
        privateBookingId: again.privateBookingId,
        dbEventId,
        eventStatus: again.eventStatus,
        requireStrongOwnership: again.eventStatus === 'cancelled',
      })
      if (!ownership.ok) {
        console.error('[google-calendar] 409 get ownership failed:', ownership.reason)
        return null
      }
      return patchExistingById({
        eventId,
        requestBody,
        ifMatchEtag: again.etag,
      })
    }
    console.error('[google-calendar] event insert failed:', error)
    return null
  }
}

async function patchExistingById(params: {
  eventId: string
  requestBody: Record<string, unknown>
  ifMatchEtag: string | null
}): Promise<CreatedCalendarEvent | null> {
  const client = getGoogleCalendarClient()
  if (!client) return null

  try {
    const response = await client.calendar.events.patch(
      {
        calendarId: client.calendarId,
        eventId: params.eventId,
        requestBody: params.requestBody,
      },
      params.ifMatchEtag
        ? { headers: { 'If-Match': params.ifMatchEtag } }
        : undefined,
    )
    return { eventId: params.eventId, etag: response.data.etag ?? null }
  } catch (error) {
    if (params.ifMatchEtag && isPreconditionFailed(error)) {
      const fresh = await fetchCoachingBookingCalendarEvent(params.eventId)
      if (fresh.status !== 'ok' || !fresh.etag) return null
      try {
        const response = await client.calendar.events.patch(
          {
            calendarId: client.calendarId,
            eventId: params.eventId,
            requestBody: params.requestBody,
          },
          { headers: { 'If-Match': fresh.etag } },
        )
        return { eventId: params.eventId, etag: response.data.etag ?? null }
      } catch (retryError) {
        console.error('[google-calendar] event restore patch retry failed:', retryError)
        return null
      }
    }
    console.error('[google-calendar] event restore patch failed:', error)
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

export type CoachingCalendarUpdateResult =
  | { status: 'updated'; etag: string | null }
  | { status: 'skipped' }
  | { status: 'failed' }
  | { status: 'precondition_failed' }
  | { status: 'missing_etag' }
  | { status: 'ownership_mismatch' }

/**
 * Existing events must always be patched with If-Match.
 * Callers obtain an etag via fetch (or DB) first — never fall back to unconditional patch.
 * Summary text alone never proves ownership; private props / stable id / DB link do.
 */
export async function updateCoachingBookingCalendarEvent(input: {
  eventId: string
  bookingId: string
  studentId: string
  coachId: string
  startsAt: string
  endsAt: string
  studentNote: string
  /** Required. Unconditional patches are rejected. */
  ifMatchEtag: string
  /** DB google_calendar_event_id for this booking (legacy ownership). */
  dbEventId?: string | null
}): Promise<CoachingCalendarUpdateResult> {
  const trimmed = input.eventId.trim()
  if (!trimmed) return { status: 'skipped' }

  const ifMatch = input.ifMatchEtag?.trim() || ''
  if (!ifMatch) return { status: 'missing_etag' }

  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; update skipped')
    return { status: 'skipped' }
  }

  const fetched = await fetchCoachingBookingCalendarEvent(trimmed)
  if (fetched.status === 'unconfigured') return { status: 'skipped' }
  if (fetched.status === 'not_found') return { status: 'failed' }
  if (fetched.status !== 'ok') return { status: 'failed' }

  const ownership = resolveCoachingCalendarEventOwnership({
    bookingId: input.bookingId,
    eventId: trimmed,
    privateBookingId: fetched.privateBookingId,
    dbEventId: input.dbEventId ?? trimmed,
    eventStatus: fetched.eventStatus,
    requireStrongOwnership: fetched.eventStatus === 'cancelled',
  })
  if (!ownership.ok) {
    console.error('[google-calendar] refuse update:', ownership.reason)
    return { status: 'ownership_mismatch' }
  }

  const supabase = await createClient()

  const { data: bookingRow } = await supabase
    .from('coaching_bookings')
    .select('status')
    .eq('id', input.bookingId)
    .maybeSingle<{ status: string }>()
  if (!bookingRow || bookingRow.status !== 'scheduled') {
    console.warn('[google-calendar] skip update: booking not scheduled')
    return { status: 'skipped' }
  }

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
  const extendedProperties = buildCoachingCalendarExtendedProperties(input.bookingId)

  try {
    const response = await client.calendar.events.patch(
      {
        calendarId: client.calendarId,
        eventId: trimmed,
        requestBody: {
          summary: `【コーチング】${studentName}さん`,
          description: buildEventDescription(coachName, input.studentNote),
          status: 'confirmed',
          extendedProperties,
          start: {
            dateTime: input.startsAt,
            timeZone: 'Asia/Tokyo',
          },
          end: {
            dateTime: input.endsAt,
            timeZone: 'Asia/Tokyo',
          },
        },
      },
      {
        headers: {
          'If-Match': ifMatch,
        },
      },
    )
    return { status: 'updated', etag: response.data.etag ?? null }
  } catch (error) {
    if (isPreconditionFailed(error)) {
      return { status: 'precondition_failed' }
    }
    console.error('[google-calendar] event patch failed:', error)
    return { status: 'failed' }
  }
}

export type FetchCalendarEventResult =
  | {
      status: 'ok'
      etag: string | null
      summary: string | null
      eventStatus: string | null
      privateBookingId: string | null
    }
  | { status: 'not_found' }
  | { status: 'unconfigured' }
  | { status: 'failed' }

export async function fetchCoachingBookingCalendarEvent(
  eventId: string,
): Promise<FetchCalendarEventResult> {
  const trimmed = eventId.trim()
  if (!trimmed) return { status: 'failed' }

  const client = getGoogleCalendarClient()
  if (!client) return { status: 'unconfigured' }

  try {
    const response = await client.calendar.events.get({
      calendarId: client.calendarId,
      eventId: trimmed,
    })
    const privateProps = response.data.extendedProperties?.private ?? null
    const privateBookingId =
      typeof privateProps?.coachingBookingId === 'string'
        ? privateProps.coachingBookingId
        : null
    return {
      status: 'ok',
      etag: response.data.etag ?? null,
      summary: response.data.summary ?? null,
      eventStatus: response.data.status ?? null,
      privateBookingId,
    }
  } catch (error) {
    if (isNotFound(error)) return { status: 'not_found' }
    console.error('[google-calendar] event get failed:', error)
    return { status: 'failed' }
  }
}

/** @deprecated Prefer fetchCoachingBookingCalendarEvent for not_found handling. */
export async function fetchCoachingBookingCalendarEventEtag(
  eventId: string,
): Promise<{ ok: true; etag: string | null } | { ok: false }> {
  const result = await fetchCoachingBookingCalendarEvent(eventId)
  if (result.status === 'ok') return { ok: true, etag: result.etag }
  return { ok: false }
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

export async function createQuizStudentCalendarEvent(input: {
  studentName: string
  title: string
  subject: string
  scheduledOn: string
  note: string
}): Promise<string | null> {
  const client = getGoogleCalendarClient()
  if (!client) {
    console.warn('[google-calendar] credentials are not configured; quiz event skipped')
    return null
  }

  const endDate = shiftDateKey(input.scheduledOn, 1)

  try {
    const response = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: `${input.studentName} ${input.title}`,
        description: buildQuizEventDescription({
          subject: input.subject,
          studentNames: [input.studentName],
          note: input.note,
        }),
        start: { date: input.scheduledOn },
        end: { date: endDate },
      },
    })

    return response.data.id ?? null
  } catch (error) {
    console.error('[google-calendar] quiz student event insert failed:', error)
    return null
  }
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
