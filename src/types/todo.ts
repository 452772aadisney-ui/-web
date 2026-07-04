export type TodoCategory = 'homework' | 'quiz' | 'application'

export interface TodoItem {
  id: string
  category: TodoCategory
  title: string
  subject?: string
  dueDate: string
  description?: string
  completed: boolean
  homeworkTaskId?: string
}

export interface HomeworkCompletion {
  id: string
  student_id: string
  homework_task_id: string
  completed_at: string
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
