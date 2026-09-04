import { createClient } from '@/lib/supabase/server'
import {
  isCoachingKarteTableMissingError,
  type CoachingKarteFetchResult,
} from '@/lib/coaching/karte-table'
import type { CoachingKarteEntryWithDetails } from '@/types/coaching'
import { DEFAULT_PAGE_SIZE, getTotalPages, parsePageParam } from '@/lib/pagination'

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
  options?: { page?: number; pageSize?: number },
): Promise<CoachingKarteFetchResult> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from('coaching_karte_entries')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (countError) {
    if (isCoachingKarteTableMissingError(countError.message)) {
      return { entries: [], tableAvailable: false, totalCount: 0, page: 1, pageSize }
    }
    return { entries: [], tableAvailable: true, totalCount: 0, page: 1, pageSize }
  }

  const totalCount = count ?? 0
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(options?.page ? String(options.page) : undefined, totalPages)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('coaching_karte_entries')
    .select(
      '*, coaching_coaches(id, name), profiles:created_by(id, full_name, display_name)',
    )
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    if (isCoachingKarteTableMissingError(error.message)) {
      return { entries: [], tableAvailable: false, totalCount: 0, page: 1, pageSize }
    }
    return { entries: [], tableAvailable: true, totalCount, page, pageSize }
  }

  return {
    entries: ((data as KarteRow[]) ?? []).map(mapKarteEntry),
    tableAvailable: true,
    totalCount,
    page,
    pageSize,
  }
}
