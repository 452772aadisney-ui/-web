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
  is_available: true
}
