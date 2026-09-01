import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildSlotDateTime,
  buildSlotEndDateTime,
  getTodayDateKey,
  slotDateTimeKey,
} from '@/lib/coaching/slot-times'
import { getWeekdays, getWeekStartMonday, parseDateKey } from '@/lib/coaching/week'
import { fetchStudentList } from '@/lib/study/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import type {
  AvailableCoachingSlot,
  CoachingBooking,
  CoachingBookingWithDetails,
  CoachingCoach,
  CoachingSlot,
} from '@/types/coaching'

export type CoachingGridSlot = {
  id: string | null
  coach_id: string
  slot_date: string
  start_time: string
  starts_at: string
  ends_at: string
  is_open: boolean
  is_booked: boolean
}

type SlotRow = CoachingSlot & {
  coaching_coaches: { id: string; name: string } | { id: string; name: string }[] | null
}

type BookingRow = CoachingBooking & {
  coaching_slots: CoachingSlot
  coaching_coaches: { id: string; name: string }
  profiles?: { id: string; full_name: string; display_name: string } | null
}

function mapCoach(row: { id: string; name: string }) {
  return { id: row.id, name: row.name }
}

function normalizeSlot(row: CoachingSlot): CoachingSlot {
  const slotDate =
    row.slot_date ?? row.starts_at.slice(0, 10)
  const startTime =
    row.start_time?.slice(0, 5) ??
    new Date(row.starts_at).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

  return {
    ...row,
    slot_date: slotDate,
    start_time: startTime,
    is_open: row.is_open ?? true,
  }
}

function mapBooking(row: BookingRow): CoachingBookingWithDetails {
  return {
    id: row.id,
    slot_id: row.slot_id,
    student_id: row.student_id,
    coach_id: row.coach_id,
    student_note: row.student_note ?? '',
    status: row.status,
    google_calendar_event_id: row.google_calendar_event_id ?? null,
    booked_at: row.booked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slot: normalizeSlot(row.coaching_slots),
    coach: mapCoach(row.coaching_coaches),
    student: row.profiles
      ? {
          id: row.profiles.id,
          full_name: row.profiles.full_name,
          display_name: row.profiles.display_name,
        }
      : undefined,
  }
}

export async function fetchCoachingCoaches(activeOnly = false): Promise<CoachingCoach[]> {
  const supabase = await createClient()
  let query = supabase.from('coaching_coaches').select('*').order('sort_order').order('name')

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('[coaching] coaches query failed:', error.message)
    return []
  }

  return (data as CoachingCoach[]) ?? []
}

/** 予約済み（scheduled）の slot_id を取得（RLSを迂回して占有状況のみ判定） */
async function fetchOccupiedCoachingSlotIds(slotIds: string[]): Promise<Set<string>> {
  if (slotIds.length === 0) return new Set()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_occupied_coaching_slot_ids', {
    p_slot_ids: slotIds,
  })

  if (!error && Array.isArray(data)) {
    return new Set(data.map(String))
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error(
      '[coaching] occupied slot lookup failed:',
      error?.message ?? 'admin client unavailable',
    )
    return new Set()
  }

  const { data: fallbackRows, error: fallbackError } = await admin
    .from('coaching_bookings')
    .select('slot_id')
    .in('slot_id', slotIds)
    .eq('status', 'scheduled')

  if (fallbackError) {
    console.error('[coaching] occupied slot fallback failed:', fallbackError.message)
    return new Set()
  }

  return new Set(((fallbackRows ?? []) as { slot_id: string }[]).map((row) => row.slot_id))
}

/** 指定枠が他生徒により予約済みか（scheduled） */
export async function isCoachingSlotOccupied(slotId: string): Promise<boolean> {
  const occupied = await fetchOccupiedCoachingSlotIds([slotId])
  return occupied.has(slotId)
}

async function fetchBookingsBySlotIds(
  slotIds: string[],
): Promise<Map<string, CoachingBooking>> {
  if (slotIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_bookings')
    .select('*')
    .in('slot_id', slotIds)
    .neq('status', 'cancelled')

  if (error) {
    console.error('[coaching] bookings by slot failed:', error.message)
    return new Map()
  }

  return new Map(((data as CoachingBooking[]) ?? []).map((b) => [b.slot_id, b]))
}

export async function fetchCoachingGridForWeek(
  coachId: string,
  weekStartMonday: string,
): Promise<CoachingGridSlot[]> {
  const weekdays = getWeekdays(weekStartMonday)
  const dateKeys = weekdays.map((d) => d.date)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_slots')
    .select('*')
    .eq('coach_id', coachId)
    .in('slot_date', dateKeys)

  if (error) {
    console.error('[coaching] grid query failed:', error.message)
    return []
  }

  const slots = ((data as CoachingSlot[]) ?? []).map(normalizeSlot)
  const occupiedSlotIds = await fetchOccupiedCoachingSlotIds(slots.map((s) => s.id))

  return slots.map((slot) => ({
    id: slot.id,
    coach_id: slot.coach_id,
    slot_date: slot.slot_date!,
    start_time: slot.start_time!.slice(0, 5),
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    is_open: slot.is_open,
    is_booked: occupiedSlotIds.has(slot.id),
  }))
}

export async function fetchAvailableCoachingSlots(
  coachId?: string,
  dateKeys?: string[],
): Promise<AvailableCoachingSlot[]> {
  const supabase = await createClient()
  const now = new Date()
  const todayKey = getTodayDateKey()

  let query = supabase
    .from('coaching_slots')
    .select('*, coaching_coaches!inner(id, name, is_active)')
    .eq('is_open', true)
    .gte('slot_date', todayKey)
    .eq('coaching_coaches.is_active', true)
    .order('slot_date')
    .order('start_time')

  if (coachId) {
    query = query.eq('coach_id', coachId)
  }

  if (dateKeys && dateKeys.length > 0) {
    query = query.in('slot_date', dateKeys)
  }

  const { data, error } = await query
  if (error) {
    console.error('[coaching] available slots query failed:', error.message)
    return []
  }

  const slots = ((data as SlotRow[]) ?? []).map((row) => normalizeSlot(row))
  const occupiedSlotIds = await fetchOccupiedCoachingSlotIds(slots.map((s) => s.id))

  return slots
    .filter((slot) => !occupiedSlotIds.has(slot.id))
    .filter((slot) => buildSlotDateTime(slot.slot_date!, slot.start_time!) > now)
    .map((slot) => {
      const coachRow = (data as SlotRow[]).find((r) => r.id === slot.id)?.coaching_coaches
      const coach = Array.isArray(coachRow) ? coachRow[0] : coachRow
      return {
        id: slot.id,
        coach_id: slot.coach_id,
        slot_date: slot.slot_date!,
        start_time: slot.start_time!.slice(0, 5),
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        is_open: true,
        created_at: slot.created_at,
        coach: mapCoach(coach!),
        is_available: true as const,
      }
    })
}

export async function fetchCoachingBookingsForStudent(
  studentId: string,
): Promise<CoachingBookingWithDetails[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_bookings')
    .select('*, coaching_slots(*), coaching_coaches(id, name)')
    .eq('student_id', studentId)
    .order('booked_at', { ascending: false })

  if (error) {
    console.error('[coaching] student bookings query failed:', error.message)
    return []
  }

  return ((data as BookingRow[]) ?? []).map(mapBooking)
}

export async function fetchCoachingBookingsForAdmin(): Promise<CoachingBookingWithDetails[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_bookings')
    .select('*, coaching_slots(*), coaching_coaches(id, name), profiles(id, full_name, display_name)')
    .order('booked_at', { ascending: false })

  if (error) {
    console.error('[coaching] admin bookings query failed:', error.message)
    return []
  }

  return ((data as BookingRow[]) ?? []).map(mapBooking)
}

export async function fetchCoachingBookingBySlotId(
  slotId: string,
): Promise<CoachingBooking | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_bookings')
    .select('*')
    .eq('slot_id', slotId)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (error) {
    console.error('[coaching] booking by slot failed:', error.message)
    return null
  }

  return (data as CoachingBooking) ?? null
}

export async function fetchCoachingSlotByKey(
  coachId: string,
  slotDate: string,
  startTime: string,
): Promise<CoachingSlot | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_slots')
    .select('*')
    .eq('coach_id', coachId)
    .eq('slot_date', slotDate)
    .eq('start_time', `${startTime}:00`)
    .maybeSingle()

  if (error) {
    console.error('[coaching] slot by key failed:', error.message)
    return null
  }

  return data ? normalizeSlot(data as CoachingSlot) : null
}

export function isSlotInPast(slotDate: string, startTime: string): boolean {
  return buildSlotDateTime(slotDate, startTime) <= new Date()
}

export function slotStartsAtIso(slotDate: string, startTime: string): string {
  return buildSlotDateTime(slotDate, startTime).toISOString()
}

export function slotEndsAtIso(slotDate: string, startTime: string): string {
  return buildSlotEndDateTime(slotDate, startTime).toISOString()
}

export { slotDateTimeKey, parseDateKey, getTodayDateKey }

export async function fetchStudentsWithoutCoachingBookingThisWeek(): Promise<
  Array<{
    id: string
    full_name: string
    display_name: string
    email: string
    student_code: string | null
  }>
> {
  const weekDates = getWeekdays(getWeekStartMonday()).map((day) => day.date)
  const [students, gradeTagByStudentId] = await Promise.all([
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const supabase = await createClient()
  const { data: bookings, error } = await supabase
    .from('coaching_bookings')
    .select('student_id, coaching_slots!inner(slot_date)')
    .eq('status', 'scheduled')
    .in('coaching_slots.slot_date', weekDates)

  if (error) {
    console.error('[coaching] unbooked students query failed:', error.message)
    return []
  }

  const bookedStudentIds = new Set((bookings ?? []).map((row) => String(row.student_id)))

  return students
    .filter((student) => !bookedStudentIds.has(student.id))
    .filter((student) => !isKisotsuGradeTag(gradeTagByStudentId.get(student.id)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ja'))
}
