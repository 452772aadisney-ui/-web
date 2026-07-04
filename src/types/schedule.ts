export type ExamScheduleType = 'mock_exam' | 'quiz'

export interface ExamSchedule {
  id: string
  title: string
  exam_type: ExamScheduleType
  subject: string
  scheduled_on: string
  note: string
  target_all: boolean
  created_at: string
  updated_at: string
}

export interface HomeworkTask {
  id: string
  title: string
  subject: string
  due_date: string
  description: string
  target_all: boolean
  created_at: string
  updated_at: string
}

export type ExamScheduleWithTargets = ExamSchedule & {
  target_student_ids: string[]
}

export type HomeworkTaskWithTargets = HomeworkTask & {
  target_student_ids: string[]
}
