/**
 * Admin-only Push registration queries (service role).
 * Selects user_id (and id for counting) only — never secrets.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  aggregateActivePushRowsForStudents,
  derivePushRegistrationView,
  filterStudentIdsByPushRegistration,
  type PushRegistrationFilter,
  type PushRegistrationView,
} from '@/lib/admin/push-registration'
import { createClient } from '@/lib/supabase/server'
import { getTotalPages, parsePageParam } from '@/lib/pagination'
import type { StudentListItemRow } from '@/lib/study/queries'

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

const PAGE_SIZE = 1000
const IN_CHUNK_SIZE = 100

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ ok: true; rows: T[] } | { ok: false }> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) return { ok: false }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { ok: true, rows }
}

/** Load active push rows (user_id only) for all users or a subset. */
export async function loadActivePushSubscriptionRows(
  admin: AdminClient,
  onlyUserIds?: ReadonlySet<string>,
): Promise<{ ok: true; rows: Array<{ user_id: string }> } | { ok: false }> {
  type Row = { user_id: string }

  if (!onlyUserIds) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('push_subscriptions')
        .select('user_id')
        .is('disabled_at', null)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    return { ok: true, rows: fetched.rows }
  }

  if (onlyUserIds.size === 0) {
    return { ok: true, rows: [] }
  }

  const rows: Row[] = []
  for (const chunk of chunkIds([...onlyUserIds], IN_CHUNK_SIZE)) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('push_subscriptions')
        .select('user_id')
        .is('disabled_at', null)
        .in('user_id', chunk)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    rows.push(...fetched.rows)
  }
  return { ok: true, rows }
}

export async function loadActivePushCountsByUserId(
  admin: AdminClient,
  onlyUserIds?: ReadonlySet<string>,
): Promise<{ ok: true; counts: Map<string, number> } | { ok: false }> {
  const loaded = await loadActivePushSubscriptionRows(admin, onlyUserIds)
  if (!loaded.ok) return { ok: false }

  const counts = new Map<string, number>()
  for (const row of loaded.rows) {
    const userId = String(row.user_id)
    if (onlyUserIds && !onlyUserIds.has(userId)) continue
    counts.set(userId, (counts.get(userId) ?? 0) + 1)
  }
  return { ok: true, counts }
}

export async function countActivePushSubscriptionsForUser(
  userId: string,
): Promise<{ ok: true; count: number } | { ok: false }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .is('disabled_at', null)
    .limit(50)

  if (error) return { ok: false }
  return { ok: true, count: data?.length ?? 0 }
}

export async function getStudentPushRegistrationView(
  studentId: string,
): Promise<PushRegistrationView> {
  const result = await countActivePushSubscriptionsForUser(studentId)
  if (!result.ok) return derivePushRegistrationView(null)
  return derivePushRegistrationView(result.count)
}

async function resolveGradeStudentIds(
  grade: string,
): Promise<{ ok: true; ids: string[] | null } | { ok: false }> {
  if (!grade) return { ok: true, ids: null }

  const supabase = await createClient()
  const { data: gradeTag, error: tagError } = await supabase
    .from('student_tags')
    .select('id')
    .eq('category', '学年')
    .eq('name', grade)
    .maybeSingle()

  if (tagError) return { ok: false }
  if (!gradeTag?.id) return { ok: true, ids: [] }

  const { data: assignments, error } = await supabase
    .from('profile_student_tags')
    .select('profile_id')
    .eq('tag_id', gradeTag.id)

  if (error) return { ok: false }
  return {
    ok: true,
    ids: (assignments ?? []).map((row) => String(row.profile_id)),
  }
}

/**
 * Ordered student ids matching search + optional grade (role=student only).
 * Uses the signed-in admin's user client (RLS), not service role for profiles.
 */
export async function fetchMatchingStudentIds(options: {
  query?: string
  grade?: string
}): Promise<{ ok: true; ids: string[] } | { ok: false }> {
  const supabase = await createClient()
  const query = (options.query?.trim() ?? '').replace(/[%(),]/g, '')
  const grade = options.grade?.trim() ?? ''

  const gradeResult = await resolveGradeStudentIds(grade)
  if (!gradeResult.ok) return { ok: false }
  if (gradeResult.ids && gradeResult.ids.length === 0) {
    return { ok: true, ids: [] }
  }

  const fetched = await fetchAllPages<{ id: string }>((from, to) => {
    let q = supabase
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .order('full_name')
      .range(from, to)

    if (gradeResult.ids) {
      q = q.in('id', gradeResult.ids)
    }
    if (query) {
      const pattern = `%${query}%`
      q = q.or(
        `full_name.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern},student_code.ilike.${pattern}`,
      )
    }
    return q
  })

  if (!fetched.ok) return { ok: false }
  return { ok: true, ids: fetched.rows.map((row) => String(row.id)) }
}

async function fetchStudentsByIdsOrdered(
  ids: string[],
): Promise<StudentListItemRow[]> {
  if (ids.length === 0) return []

  const supabase = await createClient()
  const byId = new Map<string, StudentListItemRow>()

  for (const chunk of chunkIds(ids, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, email, student_code, subjects')
      .eq('role', 'student')
      .in('id', chunk)

    if (error) {
      console.error('[students] push-filter detail fetch failed')
      continue
    }
    for (const row of (data as StudentListItemRow[]) ?? []) {
      byId.set(row.id, row)
    }
  }

  return ids.map((id) => byId.get(id)).filter((row): row is StudentListItemRow => Boolean(row))
}

export type AdminStudentsPushPageResult = {
  students: StudentListItemRow[]
  totalCount: number
  page: number
  pageSize: number
  /** Per-student registration view for the current page (and filter context). */
  registrationByStudentId: Map<string, PushRegistrationView>
  /** True when active subscription lookup failed. */
  registrationLookupFailed: boolean
}

/**
 * Student list with optional Push registration filter and accurate pagination.
 * Active definition matches notification ops: disabled_at IS NULL.
 */
export async function fetchAdminStudentsWithPushRegistration(options: {
  page?: number
  pageSize?: number
  query?: string
  grade?: string
  push?: PushRegistrationFilter
}): Promise<AdminStudentsPushPageResult> {
  const pageSize = options.pageSize ?? 30
  const pushFilter = options.push ?? 'all'
  const empty = (page: number, failed: boolean): AdminStudentsPushPageResult => ({
    students: [],
    totalCount: 0,
    page,
    pageSize,
    registrationByStudentId: new Map(),
    registrationLookupFailed: failed,
  })

  const matching = await fetchMatchingStudentIds({
    query: options.query,
    grade: options.grade,
  })
  if (!matching.ok) {
    return empty(1, true)
  }

  const admin = createAdminClient()
  if (!admin) {
    // Cannot verify push state without admin client.
    if (pushFilter !== 'all') return empty(1, true)
    const totalCount = matching.ids.length
    const totalPages = getTotalPages(totalCount, pageSize)
    const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
    const from = (page - 1) * pageSize
    const pageIds = matching.ids.slice(from, from + pageSize)
    const students = await fetchStudentsByIdsOrdered(pageIds)
    const registrationByStudentId = new Map(
      students.map((s) => [s.id, derivePushRegistrationView(null)] as const),
    )
    return {
      students,
      totalCount,
      page,
      pageSize,
      registrationByStudentId,
      registrationLookupFailed: true,
    }
  }

  const activeRows = await loadActivePushSubscriptionRows(admin)
  if (!activeRows.ok) {
    if (pushFilter !== 'all') return empty(1, true)
    const totalCount = matching.ids.length
    const totalPages = getTotalPages(totalCount, pageSize)
    const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
    const from = (page - 1) * pageSize
    const pageIds = matching.ids.slice(from, from + pageSize)
    const students = await fetchStudentsByIdsOrdered(pageIds)
    const registrationByStudentId = new Map(
      students.map((s) => [s.id, derivePushRegistrationView(null)] as const),
    )
    return {
      students,
      totalCount,
      page,
      pageSize,
      registrationByStudentId,
      registrationLookupFailed: true,
    }
  }

  const aggregated = aggregateActivePushRowsForStudents(matching.ids, activeRows.rows)
  const filteredIds = filterStudentIdsByPushRegistration(
    matching.ids,
    aggregated.countsByUserId,
    pushFilter,
  )

  const totalCount = filteredIds.length
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
  const from = (page - 1) * pageSize
  const pageIds = filteredIds.slice(from, from + pageSize)
  const students = await fetchStudentsByIdsOrdered(pageIds)

  const registrationByStudentId = new Map<string, PushRegistrationView>()
  for (const student of students) {
    registrationByStudentId.set(
      student.id,
      derivePushRegistrationView(aggregated.countsByUserId.get(student.id) ?? 0),
    )
  }

  return {
    students,
    totalCount,
    page,
    pageSize,
    registrationByStudentId,
    registrationLookupFailed: false,
  }
}
