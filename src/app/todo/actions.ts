'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { TodoCategory } from '@/types/todo'

export type TodoActionState = {
  error?: string
}

function revalidateTodoPaths(studentId: string) {
  revalidatePath('/dashboard/todo')
  revalidatePath('/dashboard')
  revalidatePath('/admin/schedule')
  revalidatePath('/admin/schedule/homework')
  revalidatePath('/admin/schedule/application')
  revalidatePath(`/admin/students/${studentId}`)
}

async function markTodoCompleted(
  table: 'homework_completions' | 'quiz_schedule_completions' | 'application_task_completions',
  studentId: string,
  column: 'homework_task_id' | 'exam_schedule_id' | 'application_task_id',
  taskId: string,
): Promise<TodoActionState> {
  const supabase = await createClient()

  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select('id')
    .eq('student_id', studentId)
    .eq(column, taskId)
    .maybeSingle()

  if (selectError) return { error: '完了の確認に失敗しました' }

  if (!existing) {
    const { error } = await supabase.from(table).insert({
      student_id: studentId,
      [column]: taskId,
      completed_at: new Date().toISOString(),
    })
    if (error) return { error: '完了の保存に失敗しました' }
  }

  return {}
}

async function markTodoIncomplete(
  table: 'homework_completions' | 'quiz_schedule_completions' | 'application_task_completions',
  studentId: string,
  column: 'homework_task_id' | 'exam_schedule_id' | 'application_task_id',
  taskId: string,
): Promise<TodoActionState> {
  const supabase = await createClient()
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('student_id', studentId)
    .eq(column, taskId)

  if (error) return { error: '未完了への変更に失敗しました' }
  return {}
}

export async function setTodoCompletion(
  category: TodoCategory,
  taskId: string,
  completed: boolean,
): Promise<TodoActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }
  if (!taskId) return { error: 'ToDo が指定されていません' }

  const config = {
    homework: {
      table: 'homework_completions' as const,
      column: 'homework_task_id' as const,
    },
    quiz: {
      table: 'quiz_schedule_completions' as const,
      column: 'exam_schedule_id' as const,
    },
    application: {
      table: 'application_task_completions' as const,
      column: 'application_task_id' as const,
    },
  }[category]

  const result = completed
    ? await markTodoCompleted(config.table, user.id, config.column, taskId)
    : await markTodoIncomplete(config.table, user.id, config.column, taskId)

  if (result.error) return result

  revalidateTodoPaths(user.id)
  return {}
}

/** @deprecated setTodoCompletion を使用 */
export async function setHomeworkCompletion(
  homeworkTaskId: string,
  completed: boolean,
): Promise<TodoActionState> {
  return setTodoCompletion('homework', homeworkTaskId, completed)
}
