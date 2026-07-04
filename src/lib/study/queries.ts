import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
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

  return data as Textbook[]
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
