import { createClient } from '@/lib/supabase/server'
import {
  isCoachingKarteTableMissingError,
  type CoachingKarteFetchResult,
} from '@/lib/coaching/karte-table'
import type { CoachingKarteEntryWithDetails } from '@/types/coaching'

type KarteRow = {
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
  coaching_coaches?: { id: string; name: string } | null
  profiles?: { id: string; full_name: string; display_name: string } | null
}

function mapKarteEntry(row: KarteRow): CoachingKarteEntryWithDetails {
  return {
    id: row.id,
    student_id: row.student_id,
    booking_id: row.booking_id,
    coach_id: row.coach_id,
    session_date: row.session_date,
    discussion_content: row.discussion_content,
    next_commitments: row.next_commitments,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    coach: row.coaching_coaches ?? null,
    created_by_profile: row.profiles ?? null,
  }
}

export async function fetchCoachingKarteEntriesForStudent(
  studentId: string,
): Promise<CoachingKarteFetchResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coaching_karte_entries')
    .select(
      '*, coaching_coaches(id, name), profiles:created_by(id, full_name, display_name)',
    )
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    if (isCoachingKarteTableMissingError(error.message)) {
      return { entries: [], tableAvailable: false }
    }
    return { entries: [], tableAvailable: true }
  }

  return {
    entries: ((data as KarteRow[]) ?? []).map(mapKarteEntry),
    tableAvailable: true,
  }
}
