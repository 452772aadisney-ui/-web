import { getSubjectTagsForCategory } from '@/lib/constants/textbook-subject-categories'
import { DEFAULT_PAGE_SIZE, getTotalPages, parsePageParam } from '@/lib/pagination'
import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
import { computeCurrentStudyStreak } from '@/lib/study/streak'
import type { Textbook } from '@/types/textbook'

function mapTextbook(book: Textbook): Textbook {
  return {
    ...book,
    usage_tags: book.usage_tags ?? [],
    detail_tags: book.detail_tags ?? [],
    cover_url: book.cover_url ?? null,
    publisher: book.publisher ?? null,
    is_seen_by_student: book.is_seen_by_student ?? true,
  }
}

function buildTextbookCategoryOrFilter(categoryLabel: string): string {
  const tags = getSubjectTagsForCategory(categoryLabel)
  const parts = [`subjects.cs.{"${categoryLabel}"}`]

  if (tags.length > 0) {
    const quoted = tags.map((tag) => `"${tag.replace(/"/g, '\\"')}"`).join(',')
    parts.push(`detail_tags.ov.{${quoted}}`)
    parts.push(`subjects.ov.{${quoted}}`)
  }

  return parts.join(',')
}

export async function fetchTextbooksForStudent(studentId: string): Promise<Textbook[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('textbooks')
    .select('*')
    .eq('student_id', studentId)
    .order('name')

  if (error || !data) {
    return []
  }

  return (data as Textbook[]).map(mapTextbook)
}

export async function fetchTextbooksForStudentPaginated(
  studentId: string,
  options: {
    page?: number
    pageSize?: number
    subjectCategory?: string | null
  },
): Promise<{
  textbooks: Textbook[]
  totalCount: number
  totalAllCount: number
  page: number
  pageSize: number
}> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const supabase = await createClient()
  const category = options.subjectCategory?.trim() || null

  const allCountQuery = supabase
    .from('textbooks')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)

  const filteredCountQuery = (() => {
    let query = supabase
      .from('textbooks')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)

    if (category) {
      query = query.or(buildTextbookCategoryOrFilter(category))
    }

    return query
  })()

  const [{ count: totalAllCount }, { count: filteredCount, error: countError }] =
    await Promise.all([allCountQuery, filteredCountQuery])

  if (countError) {
    console.error('[textbooks] paginated count failed:', countError.message)
  }

  const totalCount = filteredCount ?? 0
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let dataQuery = supabase
    .from('textbooks')
    .select('*')
    .eq('student_id', studentId)
    .order('name')
    .range(from, to)

  if (category) {
    dataQuery = dataQuery.or(buildTextbookCategoryOrFilter(category))
  }

  const { data, error } = await dataQuery

  if (error) {
    console.error('[textbooks] paginated fetch failed:', error.message)
    return {
      textbooks: [],
      totalCount,
      totalAllCount: totalAllCount ?? 0,
      page,
      pageSize,
    }
  }

  return {
    textbooks: ((data as Textbook[]) ?? []).map(mapTextbook),
    totalCount,
    totalAllCount: totalAllCount ?? 0,
    page,
    pageSize,
  }
}

export async function fetchTextbooksForStudentPreview(
  studentId: string,
  limit = 10,
): Promise<{ textbooks: Textbook[]; totalCount: number }> {
  const supabase = await createClient()

  const [{ count }, { data, error }] = await Promise.all([
    supabase
      .from('textbooks')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
    supabase
      .from('textbooks')
      .select('*')
      .eq('student_id', studentId)
      .order('name')
      .limit(limit),
  ])

  if (error || !data) {
    return { textbooks: [], totalCount: count ?? 0 }
  }

  return {
    textbooks: (data as Textbook[]).map(mapTextbook),
    totalCount: count ?? 0,
  }
}

export async function fetchStudyLogsForStudentOnDate(
  studentId: string,
  dateKey: string,
): Promise<StudyLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('*')
    .eq('student_id', studentId)
    .eq('studied_on', dateKey)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data as StudyLog[]
}

/** Sum of duration_minutes for a single JST date. Zero minutes are ignored in the total sense of "has recorded". */
export async function fetchTodayStudyMinutesForStudent(
  studentId: string,
  dateKey: string,
): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('duration_minutes')
    .eq('student_id', studentId)
    .eq('studied_on', dateKey)

  if (error || !data) return 0

  return data.reduce((sum, row) => sum + Number(row.duration_minutes ?? 0), 0)
}

export type TextbookStudyUsage = {
  lastStudiedOnByTextbookId: Record<string, string>
  recentTextbookIds: string[]
}

/** Build last-used dates and up to `limit` recently used textbook IDs (newest first, unique). */
export function buildTextbookStudyUsage(
  rows: Array<{ textbook_id: string | null; studied_on: string }>,
  limit = 4,
): TextbookStudyUsage {
  const lastStudiedOnByTextbookId: Record<string, string> = {}
  const recentTextbookIds: string[] = []

  for (const row of rows) {
    const textbookId = row.textbook_id ? String(row.textbook_id) : ''
    if (!textbookId) continue

    const studiedOn = String(row.studied_on)
    if (!lastStudiedOnByTextbookId[textbookId]) {
      lastStudiedOnByTextbookId[textbookId] = studiedOn
      if (recentTextbookIds.length < limit) {
        recentTextbookIds.push(textbookId)
      }
    }
  }

  return { lastStudiedOnByTextbookId, recentTextbookIds }
}

export async function fetchTextbookStudyUsageForStudent(
  studentId: string,
  limit = 4,
): Promise<TextbookStudyUsage> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('study_logs')
      .select('textbook_id, studied_on, created_at')
      .eq('student_id', studentId)
      .not('textbook_id', 'is', null)
      .order('studied_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    if (error || !data) {
      console.error('[study] textbook usage fetch failed:', error?.message)
      return { lastStudiedOnByTextbookId: {}, recentTextbookIds: [] }
    }

    return buildTextbookStudyUsage(
      data.map((row) => ({
        textbook_id: row.textbook_id ? String(row.textbook_id) : null,
        studied_on: String(row.studied_on),
      })),
      limit,
    )
  } catch (error) {
    console.error('[study] textbook usage fetch threw:', error)
    return { lastStudiedOnByTextbookId: {}, recentTextbookIds: [] }
  }
}

export type StudentDashboardStudySummary = {
  todayMinutes: number
  hasPositiveStudyLog: boolean
  textbookCount: number
}

/** Compact dashboard fetches: today total, any positive log, textbook count. */
export async function fetchStudentDashboardStudySummary(
  studentId: string,
  todayKey: string,
): Promise<StudentDashboardStudySummary> {
  const supabase = await createClient()

  const [todayResult, positiveLogResult, textbookCountResult] = await Promise.all([
    supabase
      .from('study_logs')
      .select('duration_minutes')
      .eq('student_id', studentId)
      .eq('studied_on', todayKey),
    supabase
      .from('study_logs')
      .select('id')
      .eq('student_id', studentId)
      .gt('duration_minutes', 0)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('textbooks')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
  ])

  const todayMinutes = (todayResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.duration_minutes ?? 0),
    0,
  )

  return {
    todayMinutes,
    hasPositiveStudyLog: Boolean(positiveLogResult.data),
    textbookCount: textbookCountResult.count ?? 0,
  }
}

export async function fetchTextbookForStudent(
  studentId: string,
  textbookId: string,
): Promise<Textbook | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('textbooks')
    .select('*')
    .eq('id', textbookId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error || !data) return null
  return mapTextbook(data as Textbook)
}

export async function fetchStudyLogsForStudentInDateRange(
  studentId: string,
  fromDate: string,
  toDate: string,
): Promise<StudyLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('*')
    .eq('student_id', studentId)
    .gte('studied_on', fromDate)
    .lte('studied_on', toDate)
    .order('studied_on', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as StudyLog[]
}

export async function fetchStudySubjectMinutesForStudent(
  studentId: string,
  options?: { fromDate?: string | null; toDate?: string | null },
): Promise<Array<{ subject: string; minutes: number }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('study_logs_subject_minutes', {
    p_student_id: studentId,
    p_from: options?.fromDate ?? null,
    p_to: options?.toDate ?? null,
  })

  if (error) {
    console.error('[study_logs] subject minutes rpc failed:', error.message)
    // Fallback: light column fetch for the requested window
    let query = supabase
      .from('study_logs')
      .select('subject, duration_minutes, studied_on')
      .eq('student_id', studentId)

    if (options?.fromDate) query = query.gte('studied_on', options.fromDate)
    if (options?.toDate) query = query.lte('studied_on', options.toDate)

    const { data: rows, error: fallbackError } = await query
    if (fallbackError || !rows) return []

    const totals = new Map<string, number>()
    for (const row of rows) {
      const subject = String(row.subject)
      totals.set(subject, (totals.get(subject) ?? 0) + Number(row.duration_minutes ?? 0))
    }
    return [...totals.entries()].map(([subject, minutes]) => ({ subject, minutes }))
  }

  return ((data as Array<{ subject: string; minutes: number | string }> | null) ?? []).map(
    (row) => ({
      subject: row.subject,
      minutes: Number(row.minutes),
    }),
  )
}

export async function fetchStudyTotalMinutesForStudent(studentId: string): Promise<number> {
  const rows = await fetchStudySubjectMinutesForStudent(studentId)
  return rows.reduce((sum, row) => sum + row.minutes, 0)
}

/** @deprecated Prefer scoped fetch helpers. Kept for callers that still need full rows. */
export async function fetchStudyLogsForStudent(studentId: string): Promise<StudyLog[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('study_logs')
    .select('*')
    .eq('student_id', studentId)
    .order('studied_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  return data as StudyLog[]
}

export async function fetchCurrentStudyStreakForStudent(studentId: string): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('study_logs')
    .select('studied_on')
    .eq('student_id', studentId)

  if (error || !data) return 0

  return computeCurrentStudyStreak(data.map((row) => String(row.studied_on)))
}

export type StudentListItemRow = {
  id: string
  full_name: string
  display_name: string
  email: string
  student_code: string | null
  subjects?: string[]
}

export async function fetchStudentList(): Promise<StudentListItemRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, student_code, subjects')
    .eq('role', 'student')
    .order('full_name')

  if (error || !data) {
    return []
  }

  return data
}

export async function fetchStudentsPaginated(options: {
  page?: number
  pageSize?: number
  query?: string
  grade?: string
}): Promise<{
  students: StudentListItemRow[]
  totalCount: number
  page: number
  pageSize: number
}> {
  const pageSize = options.pageSize ?? 30
  const supabase = await createClient()
  const query = (options.query?.trim() ?? '').replace(/[%(),]/g, '')
  const grade = options.grade?.trim() ?? ''

  let studentIdsFilter: string[] | null = null

  if (grade) {
    const { data: gradeTag } = await supabase
      .from('student_tags')
      .select('id')
      .eq('category', '学年')
      .eq('name', grade)
      .maybeSingle()

    if (!gradeTag?.id) {
      return { students: [], totalCount: 0, page: 1, pageSize }
    }

    const { data: assignments } = await supabase
      .from('profile_student_tags')
      .select('profile_id')
      .eq('tag_id', gradeTag.id)

    studentIdsFilter = (assignments ?? []).map((row) => row.profile_id as string)
    if (studentIdsFilter.length === 0) {
      return { students: [], totalCount: 0, page: 1, pageSize }
    }
  }

  let countQuery = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'student')

  let dataQuery = supabase
    .from('profiles')
    .select('id, full_name, display_name, email, student_code, subjects')
    .eq('role', 'student')
    .order('full_name')

  if (studentIdsFilter) {
    countQuery = countQuery.in('id', studentIdsFilter)
    dataQuery = dataQuery.in('id', studentIdsFilter)
  }

  if (query) {
    const pattern = `%${query}%`
    countQuery = countQuery.or(
      `full_name.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern},student_code.ilike.${pattern}`,
    )
    dataQuery = dataQuery.or(
      `full_name.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern},student_code.ilike.${pattern}`,
    )
  }

  const { count, error: countError } = await countQuery
  if (countError) {
    console.error('[students] paginated count failed:', countError.message)
  }

  const totalCount = count ?? 0
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error } = await dataQuery.range(from, to)
  if (error) {
    console.error('[students] paginated fetch failed:', error.message)
    return { students: [], totalCount, page, pageSize }
  }

  return {
    students: (data as StudentListItemRow[]) ?? [],
    totalCount,
    page,
    pageSize,
  }
}

export async function fetchStudentProfile(studentId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select(
      'id, full_name, display_name, email, student_code, role, subjects, target_schools, birthday',
    )
    .eq('id', studentId)
    .maybeSingle()

  return data
}
