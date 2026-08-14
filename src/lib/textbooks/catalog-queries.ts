import { createClient } from '@/lib/supabase/server'
import { getPersonName } from '@/lib/auth/display-name'
import type { TextbookCatalog, TextbookCatalogUsage } from '@/types/textbook'

function mapCatalog(row: Record<string, unknown>): TextbookCatalog {
  return {
    id: row.id as string,
    name: row.name as string,
    subjects: (row.subjects as string[]) ?? [],
    usage_tags: (row.usage_tags as string[]) ?? [],
    visibility: row.visibility as TextbookCatalog['visibility'],
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function fetchTextbookCatalog(): Promise<TextbookCatalog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbook_catalog')
    .select('*')
    .order('name')

  if (error) {
    console.error('[textbook-catalog] fetch failed:', error.message)
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapCatalog)
}

export async function fetchTextbookCatalogForStudent(
  studentId: string,
): Promise<TextbookCatalog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbook_catalog')
    .select('*')
    .order('name')

  if (error) {
    console.error('[textbook-catalog] student fetch failed:', error.message)
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapCatalog)
}

export async function fetchTextbookCatalogUsage(): Promise<TextbookCatalogUsage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbooks')
    .select('catalog_id, student_id, profiles(full_name, display_name)')
    .not('catalog_id', 'is', null)

  if (error) {
    console.error('[textbook-catalog] usage fetch failed:', error.message)
    return []
  }

  return (data ?? [])
    .filter((row) => row.catalog_id)
    .map((row) => {
      const profile = row.profiles as
        | { full_name: string; display_name: string }
        | { full_name: string; display_name: string }[]
        | null
      const profileRow = Array.isArray(profile) ? profile[0] : profile

      return {
        catalog_id: row.catalog_id as string,
        student_id: row.student_id as string,
        student_name: profileRow ? getPersonName(profileRow) : '不明',
      }
    })
}

export async function fetchUnseenTextbookCount(studentId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('textbooks')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('is_seen_by_student', false)

  if (error) {
    console.error('[textbooks] unseen count failed:', error.message)
    return 0
  }

  return count ?? 0
}

export async function markTextbooksAsSeen(studentId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('textbooks')
    .update({ is_seen_by_student: true })
    .eq('student_id', studentId)
    .eq('is_seen_by_student', false)
}

export async function fetchStudentCatalogIds(studentId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('textbooks')
    .select('catalog_id')
    .eq('student_id', studentId)
    .not('catalog_id', 'is', null)

  return new Set(
    ((data ?? []) as { catalog_id: string | null }[])
      .map((row) => row.catalog_id)
      .filter((id): id is string => Boolean(id)),
  )
}
