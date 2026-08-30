export type CoachingBookingStatus = 'scheduled' | 'completed' | 'cancelled'

export interface CoachingCoach {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CoachingSlot {
  id: string
  coach_id: string
  slot_date: string | null
  start_time: string | null
  is_open: boolean
  starts_at: string
  ends_at: string
  created_at: string
}

export interface CoachingBooking {
  id: string
  slot_id: string
  student_id: string
  coach_id: string
  student_note: string
  status: CoachingBookingStatus
  google_calendar_event_id: string | null
  booked_at: string
  created_at: string
  updated_at: string
}

export type CoachingSlotWithCoach = CoachingSlot & {
  coach: Pick<CoachingCoach, 'id' | 'name'>
}

export type CoachingBookingWithDetails = CoachingBooking & {
  slot: CoachingSlot
  coach: Pick<CoachingCoach, 'id' | 'name'>
  student?: { id: string; full_name: string; display_name: string }
}

export type AvailableCoachingSlot = CoachingSlotWithCoach & {
  slot_date: string
  start_time: string
  is_available: true
}

export interface CoachingKarteEntry {
  id: string
  student_id: string
  booking_id: string | null
  coach_id: string | null
  session_date: string
  discussion_content: string
  next_commitments: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CoachingKarteEntryWithDetails = CoachingKarteEntry & {
  coach?: Pick<CoachingCoach, 'id' | 'name'> | null
  created_by_profile?: { id: string; full_name: string; display_name: string } | null
}
