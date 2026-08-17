export interface QuizMaster {
  id: string
  title: string
  subject: string
  max_score: number
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QuizAssignment {
  id: string
  quiz_master_id: string
  scheduled_on: string
  note: string
  created_at: string
  updated_at: string
}

export interface QuizResult {
  id: string
  quiz_assignment_id: string
  student_id: string
  score: number
  max_score: number
  note: string
  recorded_by: string | null
  recorded_at: string
}

export interface QuizAssignmentListItem extends QuizAssignment {
  master: QuizMaster
  student_count: number
  scored_count: number
}

export interface QuizAssignmentStudentRow {
  student_id: string
  full_name: string
  display_name: string
  result: QuizResult | null
}

export interface QuizAssignmentDetail {
  assignment: QuizAssignment
  master: QuizMaster
  students: QuizAssignmentStudentRow[]
}

export interface StudentQuizResultRow {
  result: QuizResult
  assignment: QuizAssignment
  master: QuizMaster
}

export interface StudentQuizAssignmentRow {
  assignment: QuizAssignment
  master: QuizMaster
  result: QuizResult | null
}
