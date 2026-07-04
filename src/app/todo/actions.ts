'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type TodoActionState = {
  error?: string
}

function revalidateTodoPaths(studentId: string) {
  revalidatePath('/dashboard/todo')
  revalidatePath('/admin/schedule')
  revalidatePath(`/admin/students/${studentId}`)
}

export async function setHomeworkCompletion(
  homeworkTaskId: string,
  completed: boolean,
): Promise<TodoActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  if (!homeworkTaskId) return { error: '宿題が指定されていません' }

  if (completed) {
    const { error } = await supabase.from('homework_completions').upsert(
      {
        student_id: user.id,
        homework_task_id: homeworkTaskId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,homework_task_id' },
    )
    if (error) return { error: '完了の保存に失敗しました' }
  } else {
    const { error } = await supabase
      .from('homework_completions')
      .delete()
      .eq('student_id', user.id)
      .eq('homework_task_id', homeworkTaskId)
    if (error) return { error: '未完了への変更に失敗しました' }
  }

  revalidateTodoPaths(user.id)
  return {}
}
