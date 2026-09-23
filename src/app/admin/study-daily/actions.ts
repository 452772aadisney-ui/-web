'use server'

import { revalidatePath } from 'next/cache'
import {
  assertAdminCanAccessStudent,
  requireAdminAccess,
} from '@/lib/auth/admin-access'
import { notifyStudyFeedbackReceived } from '@/lib/email/notifications'
import { isStudyFeedbackStampId } from '@/lib/study/feedback'
import { detectStudyDayFeedbackWriteConflict } from '@/lib/study/pending-feedback'
import { createClient } from '@/lib/supabase/server'

export type StudyDailyFeedbackActionState = {
  error?: string
  success?: boolean
  feedbackId?: string
}

export async function upsertStudyDayFeedback(
  _prev: StudyDailyFeedbackActionState,
  formData: FormData,
): Promise<StudyDailyFeedbackActionState> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return { error: access.error }
  }

  const studentId = String(formData.get('studentId') ?? '').trim()
  const studiedOn = String(formData.get('studiedOn') ?? '').trim()
  const stamp = String(formData.get('stamp') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim()
  const expectedFeedbackId = String(formData.get('expectedFeedbackId') ?? '').trim()
  const expectedComment = String(formData.get('expectedComment') ?? '')

  if (!studentId || !studiedOn) {
    return { error: '生徒または日付が指定されていません' }
  }

  const canAccess = await assertAdminCanAccessStudent(studentId, access)
  if (!canAccess.ok) {
    return { error: canAccess.error }
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

  const conflict = detectStudyDayFeedbackWriteConflict({
    existing: existing ?? null,
    expectedFeedbackId,
    expectedComment,
  })
  if (conflict.conflict) {
    return { error: conflict.error }
  }

  const payload = {
    student_id: studentId,
    studied_on: studiedOn,
    stamp,
    comment,
    admin_id: access.profile.id,
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

  const previousComment = existing?.comment ?? ''
  const commentChanged =
    String(previousComment).trim() !== comment.trim() || !existing

  // Only clear reads when the readable comment text changes (not stamp-only re-save).
  if (savedFeedback && commentChanged) {
    await supabase
      .from('study_day_feedback_reads')
      .delete()
      .eq('feedback_id', savedFeedback.id)
      .eq('student_id', studentId)
  }

  if (comment.trim() && commentChanged) {
    await notifyStudyFeedbackReceived({
      studentId,
      studiedOn,
      stamp,
      comment,
    })
  }

  revalidatePath('/admin/study-daily')
  revalidatePath('/admin/study-daily/pending')
  revalidatePath('/dashboard/study/history')
  revalidatePath('/dashboard')

  return { success: true, feedbackId: savedFeedback?.id }
}
