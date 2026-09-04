import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
import { computeCurrentStudyStreak } from '@/lib/study/streak'
import { filterTextbooksByStudyCategory } from '@/lib/constants/textbook-subject-categories'
import { DEFAULT_PAGE_SIZE, getTotalPages, parsePageParam } from '@/lib/pagination'
import type { Textbook } from '@/types/textbook'

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

  return data.map((book) => ({
    ...(book as Textbook),
    usage_tags: (book as Textbook).usage_tags ?? [],
    detail_tags: (book as Textbook).detail_tags ?? [],
    cover_url: (book as Textbook).cover_url ?? null,
    publisher: (book as Textbook).publisher ?? null,
    is_seen_by_student: (book as Textbook).is_seen_by_student ?? true,
  }))
}

export async function fetchTextbooksForStudentPaginated(
  studentId: string,
  options: {
    page?: number
    pageSize?: number
    subjectCategory: string
  },
): Promise<{
  textbooks: Textbook[]
  totalCount: number
  totalAllCount: number
  page: number
  pageSize: number
}> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const all = await fetchTextbooksForStudent(studentId)
  const filtered = filterTextbooksByStudyCategory(all, options.subjectCategory)
  const totalCount = filtered.length
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(options.page ? String(options.page) : undefined, totalPages)
  const start = (page - 1) * pageSize
  const textbooks = filtered.slice(start, start + pageSize)

  return {
    textbooks,
    totalCount,
    totalAllCount: all.length,
    page,
    pageSize,
  }
}

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

export async function fetchStudentList(): Promise<
  Array<{
    id: string
    full_name: string
    display_name: string
    email: string
    student_code: string | null
  }>
> {
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
