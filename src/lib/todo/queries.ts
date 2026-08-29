import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { buildTodoItems } from '@/lib/todo/build-items'
import {
  fetchHomeworkTasksForStudent,
  fetchQuizSchedulesForStudent,
} from '@/lib/schedule/queries'
import type {
  ApplicationTask,
  ApplicationTaskWithTargets,
  HomeworkCompletion,
  TodoCompletions,
} from '@/types/todo'

type ApplicationTaskRow = ApplicationTask & {
  application_task_students?: Array<{ student_id: string }> | null
}

function mapApplicationTask(row: ApplicationTaskRow): ApplicationTaskWithTargets {
  const { application_task_students, ...task } = row
  return {
    ...task,
    target_student_ids:
      application_task_students?.map((entry) => entry.student_id) ?? [],
  }
}

function isVisibleToStudent(
  targetAll: boolean,
  targetStudentIds: string[],
  studentId: string,
): boolean {
  return targetAll || targetStudentIds.includes(studentId)
}

export async function fetchHomeworkCompletionsForStudent(
  studentId: string,
): Promise<HomeworkCompletion[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('homework_completions')
    .select('*')
    .eq('student_id', studentId)
  return (data as HomeworkCompletion[]) ?? []
}

export async function fetchAllHomeworkCompletions(): Promise<HomeworkCompletion[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('homework_completions').select('*')
  return (data as HomeworkCompletion[]) ?? []
}

export async function fetchTodoCompletionsForStudent(
  studentId: string,
): Promise<TodoCompletions> {
  const supabase = await createClient()
  const [{ data: homeworkRows }, { data: quizRows }, { data: applicationRows }] =
    await Promise.all([
      supabase
        .from('homework_completions')
        .select('homework_task_id')
        .eq('student_id', studentId),
      supabase
        .from('quiz_schedule_completions')
        .select('exam_schedule_id')
        .eq('student_id', studentId),
      supabase
        .from('application_task_completions')
        .select('application_task_id')
        .eq('student_id', studentId),
    ])

  return {
    homework: new Set((homeworkRows ?? []).map((row) => String(row.homework_task_id))),
    quiz: new Set((quizRows ?? []).map((row) => String(row.exam_schedule_id))),
    application: new Set(
      (applicationRows ?? []).map((row) => String(row.application_task_id)),
    ),
  }
}

export const fetchIncompleteTodoCount = cache(async (studentId: string): Promise<number> => {
  const [homework, quizzes, applications, completions] = await Promise.all([
    fetchHomeworkTasksForStudent(studentId),
    fetchQuizSchedulesForStudent(studentId),
    fetchApplicationTasksForStudent(studentId),
    fetchTodoCompletionsForStudent(studentId),
  ])

  return buildTodoItems(homework, quizzes, applications, completions).filter(
    (item) => !item.completed,
  ).length
})

export async function fetchApplicationTasksWithTargets(): Promise<ApplicationTaskWithTargets[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('application_tasks')
    .select('*, application_task_students(student_id)')
    .order('due_date', { ascending: true })

  return ((data as ApplicationTaskRow[] | null) ?? []).map(mapApplicationTask)
}

export async function fetchApplicationTasksForStudent(
  studentId: string,
): Promise<ApplicationTask[]> {
  const tasks = await fetchApplicationTasksWithTargets()
  return tasks.filter((task) =>
    isVisibleToStudent(task.target_all, task.target_student_ids, studentId),
  )
}

/** @deprecated Use fetchApplicationTasksWithTargets or fetchApplicationTasksForStudent */
export async function fetchApplicationTasks(): Promise<ApplicationTask[]> {
  return fetchApplicationTasksWithTargets()
}
