import { createClient } from '@/lib/supabase/server'
import type {
  AvailableCoachingSlot,
  CoachingBooking,
  CoachingBookingWithDetails,
  CoachingCoach,
  CoachingSlot,
} from '@/types/coaching'

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

function mapBooking(row: BookingRow): CoachingBookingWithDetails {
  return {
    id: row.id,
    slot_id: row.slot_id,
    student_id: row.student_id,
    coach_id: row.coach_id,
    student_note: row.student_note ?? '',
    status: row.status,
    booked_at: row.booked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slot: row.coaching_slots,
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

export async function fetchAvailableCoachingSlots(
  coachId?: string,
): Promise<AvailableCoachingSlot[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  let query = supabase
    .from('coaching_slots')
    .select('*, coaching_coaches!inner(id, name, is_active)')
    .gte('starts_at', now)
    .eq('coaching_coaches.is_active', true)
    .order('starts_at')

  if (coachId) {
    query = query.eq('coach_id', coachId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[coaching] available slots query failed:', error.message)
    return []
  }

  const slots = (data as SlotRow[]) ?? []
  const bookingsBySlot = await fetchBookingsBySlotIds(slots.map((s) => s.id))

  return slots
    .filter((slot) => !bookingsBySlot.has(slot.id))
    .map((slot) => {
      const coach = Array.isArray(slot.coaching_coaches)
        ? slot.coaching_coaches[0]
        : slot.coaching_coaches
      return {
        id: slot.id,
        coach_id: slot.coach_id,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        created_at: slot.created_at,
        coach: mapCoach(coach!),
        is_available: true as const,
      }
    })
}

export async function fetchCoachingSlotsForAdmin(): Promise<
  Array<CoachingSlot & { coach: { id: string; name: string }; is_booked: boolean }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_slots')
    .select('*, coaching_coaches(id, name)')
    .order('starts_at', { ascending: false })

  if (error) {
    console.error('[coaching] admin slots query failed:', error.message)
    return []
  }

  const slots = (data as SlotRow[]) ?? []
  const bookingsBySlot = await fetchBookingsBySlotIds(slots.map((s) => s.id))

  return slots.map((slot) => {
    const coach = Array.isArray(slot.coaching_coaches)
      ? slot.coaching_coaches[0]
      : slot.coaching_coaches
    return {
      id: slot.id,
      coach_id: slot.coach_id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      created_at: slot.created_at,
      coach: mapCoach(coach!),
      is_booked: bookingsBySlot.has(slot.id),
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
