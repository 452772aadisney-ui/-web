import type { TodoItem } from '@/types/todo'
import type { ExamSchedule, HomeworkTask } from '@/types/schedule'
import type { ApplicationTask, HomeworkCompletion } from '@/types/todo'

export function buildTodoItems(
  homework: HomeworkTask[],
  quizzes: ExamSchedule[],
  applications: ApplicationTask[],
  completions: HomeworkCompletion[],
): TodoItem[] {
  const completedIds = new Set(completions.map((c) => c.homework_task_id))

  const items: TodoItem[] = []

  for (const task of homework) {
    items.push({
      id: `hw-${task.id}`,
      category: 'homework',
      title: task.title,
      subject: task.subject,
      dueDate: task.due_date,
      description: task.description || undefined,
      completed: completedIds.has(task.id),
      homeworkTaskId: task.id,
    })
  }

  for (const quiz of quizzes) {
    items.push({
      id: `quiz-${quiz.id}`,
      category: 'quiz',
      title: quiz.title,
      subject: quiz.subject || undefined,
      dueDate: quiz.scheduled_on,
      description: quiz.note || undefined,
      completed: false,
    })
  }

  for (const app of applications) {
    items.push({
      id: `app-${app.id}`,
      category: 'application',
      title: app.title,
      dueDate: app.due_date,
      description: app.description || undefined,
      completed: false,
    })
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}
