import { createClient } from '@/lib/supabase/server'
import { getPersonName } from '@/lib/auth/display-name'
import type {
  AdminBookshelfOverview,
  AdminBookshelfStudentEntry,
  TextbookCatalog,
  TextbookCatalogUsage,
  TextbookCatalogWithUsers,
  TextbookUser,
} from '@/types/textbook'

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

function mapProfileName(
  profile:
    | { full_name: string; display_name: string }
    | { full_name: string; display_name: string }[]
    | null,
): string {
  const profileRow = Array.isArray(profile) ? profile[0] : profile
  return profileRow ? getPersonName(profileRow) : '不明'
}

function dedupeUsers(users: TextbookUser[]): TextbookUser[] {
  const seen = new Set<string>()
  return users.filter((user) => {
    if (seen.has(user.student_id)) return false
    seen.add(user.student_id)
    return true
  })
}

function buildStudentBookKey(name: string, subjects: string[]): string {
  return `${name.trim().toLowerCase()}::${[...subjects].sort().join('|')}`
}

type TextbookRow = {
  id: string
  name: string
  subjects: string[]
  usage_tags: string[]
  catalog_id: string | null
  student_id: string
  profiles:
    | { full_name: string; display_name: string }
    | { full_name: string; display_name: string }[]
    | null
}

async function fetchAllTextbooksWithProfiles(): Promise<TextbookRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbooks')
    .select(
      'id, name, subjects, usage_tags, catalog_id, student_id, profiles(full_name, display_name)',
    )
    .order('name')

  if (error) {
    console.error('[textbooks] admin overview fetch failed:', error.message)
    return []
  }

  return (data ?? []) as TextbookRow[]
}

export async function fetchAdminBookshelfOverview(): Promise<AdminBookshelfOverview> {
  const supabase = await createClient()
  const [{ data: catalogRows, error: catalogError }, textbooks] = await Promise.all([
    supabase.from('textbook_catalog').select('*').order('name'),
    fetchAllTextbooksWithProfiles(),
  ])

  if (catalogError) {
    console.error('[textbook-catalog] fetch failed:', catalogError.message)
  }

  const usersByCatalogId = new Map<string, TextbookUser[]>()
  const studentOnlyGroups = new Map<string, AdminBookshelfStudentEntry>()

  for (const book of textbooks) {
    const user: TextbookUser = {
      student_id: book.student_id,
      student_name: mapProfileName(book.profiles),
    }

    if (book.catalog_id) {
      const list = usersByCatalogId.get(book.catalog_id) ?? []
      list.push(user)
      usersByCatalogId.set(book.catalog_id, list)
      continue
    }

    const key = buildStudentBookKey(book.name, book.subjects ?? [])
    const existing = studentOnlyGroups.get(key)
    if (existing) {
      existing.users.push(user)
      continue
    }

    studentOnlyGroups.set(key, {
      key,
      name: book.name,
      subjects: book.subjects ?? [],
      usage_tags: book.usage_tags ?? [],
      users: [user],
    })
  }

  const catalog: TextbookCatalogWithUsers[] = ((catalogRows ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const item = mapCatalog(row)
      return {
        ...item,
        users: dedupeUsers(usersByCatalogId.get(item.id) ?? []),
      }
    },
  )

  const studentEntries = [...studentOnlyGroups.values()]
    .map((entry) => ({
      ...entry,
      users: dedupeUsers(entry.users).sort((a, b) =>
        a.student_name.localeCompare(b.student_name, 'ja'),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return { catalog, studentEntries }
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
  const overview = await fetchAdminBookshelfOverview()

  return overview.catalog.flatMap((item) =>
    item.users.map((user) => ({
      catalog_id: item.id,
      student_id: user.student_id,
      student_name: user.student_name,
    })),
  )
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
