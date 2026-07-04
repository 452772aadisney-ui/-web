import { createClient } from '@/lib/supabase/server'
import type {
  ApplicationTask,
  ApplicationTaskWithTargets,
  HomeworkCompletion,
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
