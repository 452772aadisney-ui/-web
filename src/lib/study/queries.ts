import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
import { computeCurrentStudyStreak } from '@/lib/study/streak'
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
    is_seen_by_student: (book as Textbook).is_seen_by_student ?? true,
  }))
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
