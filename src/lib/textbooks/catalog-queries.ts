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
}

async function fetchAllTextbooksForAdmin(): Promise<TextbookRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbooks')
    .select('id, name, subjects, usage_tags, catalog_id, student_id')
    .order('name')

  if (error) {
    console.error('[textbooks] admin overview fetch failed:', error.message)

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('textbooks')
      .select('id, name, subjects, usage_tags, student_id')
      .order('name')

    if (fallbackError) {
      console.error('[textbooks] admin overview fallback failed:', fallbackError.message)
      return []
    }

    return ((fallbackData ?? []) as Omit<TextbookRow, 'catalog_id'>[]).map((book) => ({
      ...book,
      catalog_id: null,
    }))
  }

  return (data ?? []) as TextbookRow[]
}

async function fetchStudentNamesById(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', studentIds)

  if (error) {
    console.error('[textbooks] admin profile fetch failed:', error.message)
    return new Map()
  }

  return new Map(
    (data ?? []).map((profile) => [
      profile.id as string,
      getPersonName(profile as { full_name: string; display_name: string }),
    ]),
  )
}

export async function fetchAdminBookshelfOverview(): Promise<AdminBookshelfOverview> {
  const supabase = await createClient()
  const [{ data: catalogRows, error: catalogError }, textbooks] = await Promise.all([
    supabase.from('textbook_catalog').select('*').order('name'),
    fetchAllTextbooksForAdmin(),
  ])

  if (catalogError) {
    console.error('[textbook-catalog] fetch failed:', catalogError.message)
  }

  const studentNameById = await fetchStudentNamesById([
    ...new Set(textbooks.map((book) => book.student_id)),
  ])

  const usersByCatalogId = new Map<string, TextbookUser[]>()
  const textbookIdsByCatalogId = new Map<string, Record<string, string>>()
  const studentOnlyGroups = new Map<string, AdminBookshelfStudentEntry>()

  for (const book of textbooks) {
    const user: TextbookUser = {
      student_id: book.student_id,
      student_name: studentNameById.get(book.student_id) ?? '不明',
    }

    if (book.catalog_id) {
      const list = usersByCatalogId.get(book.catalog_id) ?? []
      list.push(user)
      usersByCatalogId.set(book.catalog_id, list)

      const ids = textbookIdsByCatalogId.get(book.catalog_id) ?? {}
      ids[book.student_id] = book.id
      textbookIdsByCatalogId.set(book.catalog_id, ids)
      continue
    }

    const key = buildStudentBookKey(book.name, book.subjects ?? [])
    const existing = studentOnlyGroups.get(key)
    if (existing) {
      existing.users.push(user)
      existing.textbookIdsByStudent[book.student_id] = book.id
      continue
    }

    studentOnlyGroups.set(key, {
      key,
      name: book.name,
      subjects: book.subjects ?? [],
      usage_tags: book.usage_tags ?? [],
      users: [user],
      textbookIdsByStudent: { [book.student_id]: book.id },
    })
  }

  const catalog: TextbookCatalogWithUsers[] = ((catalogRows ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const item = mapCatalog(row)
      return {
        ...item,
        isManagedCatalog: true,
        textbookIdsByStudent: textbookIdsByCatalogId.get(item.id) ?? {},
        users: dedupeUsers(usersByCatalogId.get(item.id) ?? []).sort((a, b) =>
          a.student_name.localeCompare(b.student_name, 'ja'),
        ),
      }
    },
  )

  const catalogIds = new Set(catalog.map((item) => item.id))

  for (const [catalogId, users] of usersByCatalogId.entries()) {
    if (catalogIds.has(catalogId)) continue

    const sample = textbooks.find((book) => book.catalog_id === catalogId)
    if (!sample) continue

    catalog.push({
      id: catalogId,
      name: sample.name,
      subjects: sample.subjects ?? [],
      usage_tags: sample.usage_tags ?? [],
      visibility: 'private',
      created_by: null,
      created_at: '',
      updated_at: '',
      isManagedCatalog: false,
      textbookIdsByStudent: textbookIdsByCatalogId.get(catalogId) ?? {},
      users: dedupeUsers(users).sort((a, b) =>
        a.student_name.localeCompare(b.student_name, 'ja'),
      ),
    })
  }

  const studentEntries = [...studentOnlyGroups.values()]
    .map((entry) => ({
      ...entry,
      users: dedupeUsers(entry.users).sort((a, b) =>
        a.student_name.localeCompare(b.student_name, 'ja'),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return {
    catalog: catalog.sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    studentEntries,
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
  const { data, error } = await supabase
    .from('textbooks')
    .select('catalog_id')
    .eq('student_id', studentId)
    .not('catalog_id', 'is', null)

  if (error) {
    console.error('[textbooks] student catalog ids failed:', error.message)
    return new Set()
  }

  return new Set(
    ((data ?? []) as { catalog_id: string | null }[])
      .map((row) => row.catalog_id)
      .filter((id): id is string => Boolean(id)),
  )
}
