'use server'

import { revalidatePath } from 'next/cache'
import { notifyStudyFeedbackReceived } from '@/lib/email/notifications'
import { isStudyFeedbackStampId } from '@/lib/study/feedback'
import { createClient } from '@/lib/supabase/server'

export type StudyDailyFeedbackActionState = {
  error?: string
  success?: boolean
}

async function assertAdmin(): Promise<{ error: string } | { userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインが必要です' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') {
    return { error: '管理者権限が必要です' }
  }

  return { userId: user.id }
}

export async function upsertStudyDayFeedback(
  _prev: StudyDailyFeedbackActionState,
  formData: FormData,
): Promise<StudyDailyFeedbackActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) {
    return { error: auth.error }
  }

  const studentId = String(formData.get('studentId') ?? '').trim()
  const studiedOn = String(formData.get('studiedOn') ?? '').trim()
  const stamp = String(formData.get('stamp') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim()

  if (!studentId || !studiedOn) {
    return { error: '生徒または日付が指定されていません' }
  }

  if (!isStudyFeedbackStampId(stamp)) {
    return { error: 'スタンプを選択してください' }
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('study_day_feedback')
    .select('id, comment')
    .eq('student_id', studentId)
    .eq('studied_on', studiedOn)
    .maybeSingle<{ id: string; comment: string }>()

  const payload = {
    student_id: studentId,
    studied_on: studiedOn,
    stamp,
    comment,
    admin_id: auth.userId,
  }

  const { error } = existing
    ? await supabase.from('study_day_feedback').update(payload).eq('id', existing.id)
    : await supabase.from('study_day_feedback').insert(payload)

  if (error) {
    return { error: 'フィードバックの保存に失敗しました' }
  }

  const { data: savedFeedback } = await supabase
    .from('study_day_feedback')
    .select('id')
    .eq('student_id', studentId)
    .eq('studied_on', studiedOn)
    .maybeSingle<{ id: string }>()

  if (savedFeedback) {
    await supabase
      .from('study_day_feedback_reads')
      .delete()
      .eq('feedback_id', savedFeedback.id)
      .eq('student_id', studentId)
  }

  if (comment.trim()) {
    await notifyStudyFeedbackReceived({
      studentId,
      studiedOn,
      stamp,
      comment,
    })
  }

  revalidatePath('/admin/study-daily')
  revalidatePath('/dashboard/study/history')
  revalidatePath('/dashboard')

  return { success: true }
}
