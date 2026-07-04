import { createClient } from '@/lib/supabase/server'
import type {
  ExamSchedule,
  ExamScheduleWithTargets,
  HomeworkTask,
  HomeworkTaskWithTargets,
} from '@/types/schedule'

type ExamScheduleRow = ExamSchedule & {
  exam_schedule_students?: Array<{ student_id: string }> | null
}

type HomeworkTaskRow = HomeworkTask & {
  homework_task_students?: Array<{ student_id: string }> | null
}

function mapExamSchedule(row: ExamScheduleRow): ExamScheduleWithTargets {
  const { exam_schedule_students, ...exam } = row
  return {
    ...exam,
    target_student_ids:
      exam_schedule_students?.map((entry) => entry.student_id) ?? [],
  }
}

function mapHomeworkTask(row: HomeworkTaskRow): HomeworkTaskWithTargets {
  const { homework_task_students, ...task } = row
  return {
    ...task,
    target_student_ids:
      homework_task_students?.map((entry) => entry.student_id) ?? [],
  }
}

function isVisibleToStudent(
  targetAll: boolean,
  targetStudentIds: string[],
  studentId: string,
): boolean {
  return targetAll || targetStudentIds.includes(studentId)
}

export async function fetchExamSchedulesWithTargets(): Promise<ExamScheduleWithTargets[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('exam_schedules')
    .select('*, exam_schedule_students(student_id)')
    .order('scheduled_on', { ascending: true })

  return ((data as ExamScheduleRow[] | null) ?? []).map(mapExamSchedule)
}

export async function fetchHomeworkTasksWithTargets(): Promise<HomeworkTaskWithTargets[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('homework_tasks')
    .select('*, homework_task_students(student_id)')
    .order('due_date', { ascending: true })

  return ((data as HomeworkTaskRow[] | null) ?? []).map(mapHomeworkTask)
}

export async function fetchExamSchedulesForStudent(
  studentId: string,
): Promise<ExamSchedule[]> {
  const schedules = await fetchExamSchedulesWithTargets()
  return schedules.filter((schedule) =>
    isVisibleToStudent(schedule.target_all, schedule.target_student_ids, studentId),
  )
}

export async function fetchHomeworkTasksForStudent(
  studentId: string,
): Promise<HomeworkTask[]> {
  const tasks = await fetchHomeworkTasksWithTargets()
  return tasks.filter((task) =>
    isVisibleToStudent(task.target_all, task.target_student_ids, studentId),
  )
}

export async function fetchQuizSchedulesForStudent(
  studentId: string,
): Promise<ExamSchedule[]> {
  const schedules = await fetchExamSchedulesForStudent(studentId)
  return schedules.filter((schedule) => schedule.exam_type === 'quiz')
}

/** @deprecated Use fetchExamSchedulesWithTargets or fetchExamSchedulesForStudent */
export async function fetchExamSchedules(): Promise<ExamSchedule[]> {
  return fetchExamSchedulesWithTargets()
}

/** @deprecated Use fetchHomeworkTasksWithTargets or fetchHomeworkTasksForStudent */
export async function fetchHomeworkTasks(): Promise<HomeworkTask[]> {
  return fetchHomeworkTasksWithTargets()
}

/** @deprecated Use fetchQuizSchedulesForStudent */
export async function fetchQuizSchedules(): Promise<ExamSchedule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('exam_schedules')
    .select('*')
    .eq('exam_type', 'quiz')
    .order('scheduled_on', { ascending: true })
  return (data as ExamSchedule[]) ?? []
}
