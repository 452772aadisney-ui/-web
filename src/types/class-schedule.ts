export type ClassScheduleStatus = 'scheduled' | 'cancelled'

export interface ClassScheduleDay {
  id: string
  schedule_date: string
  venue_name: string
  /** New free-text place details (preferred). */
  location_details: string | null
  /** Legacy — kept for migration fallback; new UI does not write these. */
  address: string | null
  map_url: string | null
  room_note: string | null
  status: ClassScheduleStatus
  notify_revision: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ClassScheduleSession {
  id: string
  day_id: string
  start_time: string
  end_time: string
  subject: string
  note: string | null
  status: ClassScheduleStatus
  created_at: string
  updated_at: string
}

export type ClassScheduleDayWithSessions = ClassScheduleDay & {
  sessions: ClassScheduleSession[]
}

export type ClassScheduleSessionInput = {
  start_time: string
  end_time: string
  subject: string
  note?: string | null
  status?: ClassScheduleStatus
}
