import { createClient } from '@/lib/supabase/server'
import type {
  QuizAssignmentDetail,
  QuizAssignmentListItem,
  QuizMaster,
  QuizResult,
  StudentQuizAssignmentRow,
  StudentQuizResultRow,
} from '@/types/quiz'

export async function fetchQuizMasters(activeOnly = false): Promise<QuizMaster[]> {
  const supabase = await createClient()
  let query = supabase
    .from('quiz_masters')
    .select('*')
    .order('title', { ascending: true })

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data } = await query
  return (data as QuizMaster[] | null) ?? []
}

export async function fetchQuizAssignments(): Promise<QuizAssignmentListItem[]> {
  const supabase = await createClient()

  const [{ data: assignments }, { data: masters }, { data: students }, { data: results }] =
    await Promise.all([
      supabase
        .from('quiz_assignments')
        .select('*')
        .order('scheduled_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('quiz_masters').select('*'),
      supabase.from('quiz_assignment_students').select('quiz_assignment_id, student_id'),
      supabase.from('quiz_results').select('quiz_assignment_id, student_id'),
    ])

  const masterById = new Map(((masters as QuizMaster[] | null) ?? []).map((m) => [m.id, m]))
  const studentCountByAssignment = new Map<string, number>()
  const scoredCountByAssignment = new Map<string, number>()

  for (const row of students ?? []) {
    const id = String(row.quiz_assignment_id)
    studentCountByAssignment.set(id, (studentCountByAssignment.get(id) ?? 0) + 1)
  }

  for (const row of results ?? []) {
    const id = String(row.quiz_assignment_id)
    scoredCountByAssignment.set(id, (scoredCountByAssignment.get(id) ?? 0) + 1)
  }

  return ((assignments ?? []) as QuizAssignmentListItem[])
    .map((assignment) => {
      const master = masterById.get(assignment.quiz_master_id)
      if (!master) return null
      return {
        ...assignment,
        master,
        student_count: studentCountByAssignment.get(assignment.id) ?? 0,
        scored_count: scoredCountByAssignment.get(assignment.id) ?? 0,
      }
    })
    .filter((item): item is QuizAssignmentListItem => item != null)
}

export async function fetchQuizAssignmentDetail(
  assignmentId: string,
): Promise<QuizAssignmentDetail | null> {
  const supabase = await createClient()

  const { data: assignment } = await supabase
    .from('quiz_assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return null

  const [{ data: master }, { data: assignmentStudents }, { data: results }] = await Promise.all([
    supabase
      .from('quiz_masters')
      .select('*')
      .eq('id', assignment.quiz_master_id)
      .maybeSingle(),
    supabase
      .from('quiz_assignment_students')
      .select('student_id')
      .eq('quiz_assignment_id', assignmentId),
    supabase.from('quiz_results').select('*').eq('quiz_assignment_id', assignmentId),
  ])

  if (!master) return null

  const studentIds = (assignmentStudents ?? []).map((row) => String(row.student_id))
  const { data: profiles } = studentIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, display_name')
        .in('id', studentIds)
    : { data: [] }

  const profileById = new Map(
    (profiles ?? []).map((profile) => [String(profile.id), profile]),
  )

  const resultByStudent = new Map(
    ((results as QuizResult[] | null) ?? []).map((result) => [result.student_id, result]),
  )

  const students = studentIds
    .map((studentId) => {
      const profile = profileById.get(studentId)
      if (!profile) return null

      return {
        student_id: studentId,
        full_name: profile.full_name,
        display_name: profile.display_name,
        result: resultByStudent.get(studentId) ?? null,
      }
    })
    .filter((row): row is QuizAssignmentDetail['students'][number] => row != null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ja'))

  return {
    assignment: assignment as QuizAssignmentDetail['assignment'],
    master: master as QuizMaster,
    students,
  }
}

export async function fetchStudentQuizAssignments(
  studentId: string,
): Promise<StudentQuizAssignmentRow[]> {
  const supabase = await createClient()

  const [{ data: links }, { data: assignments }, { data: masters }, { data: results }] =
    await Promise.all([
      supabase
        .from('quiz_assignment_students')
        .select('quiz_assignment_id')
        .eq('student_id', studentId),
      supabase.from('quiz_assignments').select('*'),
      supabase.from('quiz_masters').select('*'),
      supabase.from('quiz_results').select('*').eq('student_id', studentId),
    ])

  const assignmentIds = new Set((links ?? []).map((row) => String(row.quiz_assignment_id)))
  const masterById = new Map(((masters as QuizMaster[] | null) ?? []).map((m) => [m.id, m]))
  const resultByAssignment = new Map(
    ((results as QuizResult[] | null) ?? []).map((result) => [
      result.quiz_assignment_id,
      result,
    ]),
  )

  return ((assignments ?? []) as StudentQuizAssignmentRow['assignment'][])
    .filter((assignment) => assignmentIds.has(assignment.id))
    .map((assignment) => {
      const master = masterById.get(assignment.quiz_master_id)
      if (!master) return null
      return {
        assignment,
        master,
        result: resultByAssignment.get(assignment.id) ?? null,
      }
    })
    .filter((row): row is StudentQuizAssignmentRow => row != null)
    .sort((a, b) => b.assignment.scheduled_on.localeCompare(a.assignment.scheduled_on))
}

export async function fetchStudentQuizResults(
  studentId: string,
): Promise<StudentQuizResultRow[]> {
  const supabase = await createClient()

  const { data: results } = await supabase
    .from('quiz_results')
    .select('*')
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: false })

  if (!results || results.length === 0) return []

  const assignmentIds = [...new Set(results.map((result) => result.quiz_assignment_id))]

  const [{ data: assignments }, { data: masters }] = await Promise.all([
    supabase.from('quiz_assignments').select('*').in('id', assignmentIds),
    supabase.from('quiz_masters').select('*'),
  ])

  const assignmentById = new Map(
    ((assignments ?? []) as StudentQuizResultRow['assignment'][]).map((item) => [
      item.id,
      item,
    ]),
  )
  const masterById = new Map(((masters as QuizMaster[] | null) ?? []).map((m) => [m.id, m]))

  return (results as QuizResult[])
    .map((result) => {
      const assignment = assignmentById.get(result.quiz_assignment_id)
      if (!assignment) return null
      const master = masterById.get(assignment.quiz_master_id)
      if (!master) return null
      return { result, assignment, master }
    })
    .filter((row): row is StudentQuizResultRow => row != null)
    .sort((a, b) => b.assignment.scheduled_on.localeCompare(a.assignment.scheduled_on))
}
