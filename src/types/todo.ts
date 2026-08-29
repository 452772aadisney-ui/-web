export type TodoCategory = 'homework' | 'quiz' | 'application'

export interface TodoItem {
  id: string
  category: TodoCategory
  title: string
  subject?: string
  dueDate: string
  description?: string
  completed: boolean
  /** 完了記録に使う元データの ID */
  sourceId: string
  /** @deprecated sourceId を使用 */
  homeworkTaskId?: string
}

export interface HomeworkCompletion {
  id: string
  student_id: string
  homework_task_id: string
  completed_at: string
}

export interface QuizScheduleCompletion {
  id: string
  student_id: string
  exam_schedule_id: string
  completed_at: string
}

export interface ApplicationTaskCompletion {
  id: string
  student_id: string
  application_task_id: string
  completed_at: string
}

export type TodoCompletions = {
  homework: Set<string>
  quiz: Set<string>
  application: Set<string>
}

export interface ApplicationTask {
  id: string
  title: string
  due_date: string
  description: string
  target_all: boolean
  created_at: string
  updated_at: string
}

export type ApplicationTaskWithTargets = ApplicationTask & {
  target_student_ids: string[]
}
