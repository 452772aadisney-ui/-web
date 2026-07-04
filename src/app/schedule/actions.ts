'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type { ExamScheduleType } from '@/types/schedule'

export type ScheduleActionState = {
  error?: string
  success?: boolean
}

async function assertAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'ログインが必要です'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return '管理者権限が必要です'
  return null
}

function revalidateSchedulePaths() {
  revalidatePath('/admin/schedule')
  revalidatePath('/admin/textbooks')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/todo')
  revalidatePath('/admin/students')
}

function parseStudentIds(formData: FormData): string[] {
  return formData.getAll('targetStudentIds').map(String).filter(Boolean)
}

async function syncExamScheduleStudents(
  scheduleId: string,
  studentIds: string[],
): Promise<string | null> {
  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('exam_schedule_students')
    .delete()
    .eq('exam_schedule_id', scheduleId)

  if (deleteError) return '配信先の更新に失敗しました'

  if (studentIds.length === 0) return null

  const { error: insertError } = await supabase.from('exam_schedule_students').insert(
    studentIds.map((studentId) => ({
      exam_schedule_id: scheduleId,
      student_id: studentId,
    })),
  )

  if (insertError) return '配信先の更新に失敗しました'
  return null
}

async function syncHomeworkTaskStudents(
  taskId: string,
  studentIds: string[],
): Promise<string | null> {
  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('homework_task_students')
    .delete()
    .eq('homework_task_id', taskId)

  if (deleteError) return '配信先の更新に失敗しました'

  if (studentIds.length === 0) return null

  const { error: insertError } = await supabase.from('homework_task_students').insert(
    studentIds.map((studentId) => ({
      homework_task_id: taskId,
      student_id: studentId,
    })),
  )

  if (insertError) return '配信先の更新に失敗しました'
  return null
}

async function syncApplicationTaskStudents(
  taskId: string,
  studentIds: string[],
): Promise<string | null> {
  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('application_task_students')
    .delete()
    .eq('application_task_id', taskId)

  if (deleteError) return '配信先の更新に失敗しました'

  if (studentIds.length === 0) return null

  const { error: insertError } = await supabase.from('application_task_students').insert(
    studentIds.map((studentId) => ({
      application_task_id: taskId,
      student_id: studentId,
    })),
  )

  if (insertError) return '配信先の更新に失敗しました'
  return null
}

export async function createExamSchedule(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const title = String(formData.get('title') ?? '').trim()
  const examType = String(formData.get('examType') ?? '') as ExamScheduleType
  const subject = String(formData.get('subject') ?? '').trim()
  const scheduledOn = String(formData.get('scheduledOn') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!title || !scheduledOn) {
    return { error: 'タイトルと実施日は必須です' }
  }

  if (examType !== 'mock_exam' && examType !== 'quiz') {
    return { error: '種別を選択してください' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exam_schedules')
    .insert({
      title,
      exam_type: examType,
      subject,
      scheduled_on: scheduledOn,
      note,
      target_all: false,
    })
    .select('id')
    .single()

  if (error || !data) return { error: '登録に失敗しました' }

  const syncError = await syncExamScheduleStudents(data.id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function updateExamSchedule(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const examType = String(formData.get('examType') ?? '') as ExamScheduleType
  const subject = String(formData.get('subject') ?? '').trim()
  const scheduledOn = String(formData.get('scheduledOn') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!id || !title || !scheduledOn) {
    return { error: '必須項目を入力してください' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('exam_schedules')
    .update({
      title,
      exam_type: examType,
      subject,
      scheduled_on: scheduledOn,
      note,
      target_all: false,
    })
    .eq('id', id)

  if (error) return { error: '更新に失敗しました' }

  const syncError = await syncExamScheduleStudents(id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function deleteExamSchedule(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('exam_schedules').delete().eq('id', id)
  revalidateSchedulePaths()
}

export async function createHomeworkTask(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const title = String(formData.get('title') ?? '').trim()
  const subject = String(formData.get('subject') ?? '').trim()
  const dueDate = String(formData.get('dueDate') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!title || !subject || !dueDate) {
    return { error: 'タイトル・教科・期日は必須です' }
  }

  if (!EXAM_SUBJECTS.includes(subject as (typeof EXAM_SUBJECTS)[number])) {
    return { error: '教科を正しく選択してください' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('homework_tasks')
    .insert({
      title,
      subject,
      due_date: dueDate,
      description,
      target_all: false,
    })
    .select('id')
    .single()

  if (error || !data) return { error: '登録に失敗しました' }

  const syncError = await syncHomeworkTaskStudents(data.id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function updateHomeworkTask(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const subject = String(formData.get('subject') ?? '').trim()
  const dueDate = String(formData.get('dueDate') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!id || !title || !subject || !dueDate) {
    return { error: '必須項目を入力してください' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('homework_tasks')
    .update({
      title,
      subject,
      due_date: dueDate,
      description,
      target_all: false,
    })
    .eq('id', id)

  if (error) return { error: '更新に失敗しました' }

  const syncError = await syncHomeworkTaskStudents(id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function deleteHomeworkTask(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('homework_tasks').delete().eq('id', id)
  revalidateSchedulePaths()
}

export async function createApplicationTask(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const title = String(formData.get('title') ?? '').trim()
  const dueDate = String(formData.get('dueDate') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!title || !dueDate) {
    return { error: 'タイトルと期日は必須です' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('application_tasks')
    .insert({
      title,
      due_date: dueDate,
      description,
      target_all: false,
    })
    .select('id')
    .single()

  if (error || !data) return { error: '登録に失敗しました' }

  const syncError = await syncApplicationTaskStudents(data.id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function updateApplicationTask(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const dueDate = String(formData.get('dueDate') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!id || !title || !dueDate) {
    return { error: '必須項目を入力してください' }
  }

  if (studentIds.length === 0) {
    return { error: '登録する生徒を1名以上選択してください' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('application_tasks')
    .update({
      title,
      due_date: dueDate,
      description,
      target_all: false,
    })
    .eq('id', id)

  if (error) return { error: '更新に失敗しました' }

  const syncError = await syncApplicationTaskStudents(id, studentIds)
  if (syncError) return { error: syncError }

  revalidateSchedulePaths()
  return { success: true }
}

export async function deleteApplicationTask(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('application_tasks').delete().eq('id', id)
  revalidateSchedulePaths()
}
