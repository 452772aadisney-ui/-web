'use server'

import { revalidatePath } from 'next/cache'
import {
  assertAdminCanAccessStudent,
  requireAdminAccess,
} from '@/lib/auth/admin-access'
import { notifyStudyFeedbackReceived } from '@/lib/email/notifications'
import {
  isStudyFeedbackStampId,
  type StudyDayFeedback,
} from '@/lib/study/feedback'
import {
  didStudyFeedbackCommentChange,
  interpretConditionalUpdateResult,
  interpretInsertResult,
  resolveStudyDayFeedbackWriteIntent,
  shouldRunStudyFeedbackSideEffects,
  STUDY_FEEDBACK_CONFLICT_MESSAGE,
  type StudyDayFeedbackLatestSnapshot,
} from '@/lib/study/study-day-feedback-write'
import { createClient } from '@/lib/supabase/server'

export type StudyDailyFeedbackActionState = {
  error?: string
  success?: boolean
  conflict?: boolean
  feedbackId?: string
  updatedAt?: string
  stamp?: string
  comment?: string
  /** Present on conflict so the UI can show latest without adopting it as expected version. */
  latestFeedback?: StudyDayFeedbackLatestSnapshot | null
}

function asSnapshot(row: {
  id: string
  student_id: string
  studied_on: string
  stamp: string
  comment: string
  admin_id: string
  created_at: string
  updated_at: string
}): StudyDayFeedbackLatestSnapshot | null {
  if (!isStudyFeedbackStampId(row.stamp)) return null
  return {
    id: row.id,
    student_id: row.student_id,
    studied_on: row.studied_on,
    stamp: row.stamp,
    comment: row.comment,
    admin_id: row.admin_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function fetchLatestFeedbackSnapshot(
  studentId: string,
  studiedOn: string,
): Promise<StudyDayFeedbackLatestSnapshot | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('study_day_feedback')
    .select('id, student_id, studied_on, stamp, comment, admin_id, created_at, updated_at')
    .eq('student_id', studentId)
    .eq('studied_on', studiedOn)
    .maybeSingle()

  if (!data) return null
  return asSnapshot(data)
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
  const expectedUpdatedAt = String(formData.get('expectedUpdatedAt') ?? '').trim()

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

  const intent = resolveStudyDayFeedbackWriteIntent({
    expectedFeedbackId,
    expectedUpdatedAt,
  })
  if ('error' in intent) {
    return { error: intent.error, conflict: true }
  }

  const supabase = await createClient()
  const payload = {
    student_id: studentId,
    studied_on: studiedOn,
    stamp,
    comment,
    admin_id: access.profile.id,
  }

  const outcome =
    intent.type === 'insert'
      ? await (async () => {
          const { data, error } = await supabase
            .from('study_day_feedback')
            .insert(payload)
            .select('id, student_id, studied_on, stamp, comment, admin_id, created_at, updated_at')
            .maybeSingle()

          const interpreted = interpretInsertResult({
            error,
            row: data ? asSnapshot(data) : null,
          })

          if (!interpreted.ok && interpreted.conflict) {
            const latest = await fetchLatestFeedbackSnapshot(studentId, studiedOn)
            return { ...interpreted, latest }
          }
          return interpreted
        })()
      : await (async () => {
          // Pre-image under the same version predicate (not a fresh updated_at swap).
          const { data: current, error: currentError } = await supabase
            .from('study_day_feedback')
            .select('id, comment, updated_at')
            .eq('id', intent.id)
            .eq('updated_at', intent.expectedUpdatedAt)
            .maybeSingle<{ id: string; comment: string; updated_at: string }>()

          if (currentError) {
            return {
              ok: false as const,
              conflict: false,
              error: 'フィードバックの保存に失敗しました',
            }
          }
          if (!current) {
            const latest = await fetchLatestFeedbackSnapshot(studentId, studiedOn)
            return {
              ok: false as const,
              conflict: true,
              error: STUDY_FEEDBACK_CONFLICT_MESSAGE,
              latest,
            }
          }

          const { data: updated, error: updateError } = await supabase
            .from('study_day_feedback')
            .update(payload)
            .eq('id', intent.id)
            .eq('updated_at', intent.expectedUpdatedAt)
            .select('id, student_id, studied_on, stamp, comment, admin_id, created_at, updated_at')
            .maybeSingle()

          const interpreted = interpretConditionalUpdateResult({
            error: updateError,
            updatedRow: updated ? asSnapshot(updated) : null,
            previousComment: current.comment,
          })

          if (!interpreted.ok && interpreted.conflict) {
            const latest = await fetchLatestFeedbackSnapshot(studentId, studiedOn)
            return { ...interpreted, latest }
          }
          return interpreted
        })()

  if (!shouldRunStudyFeedbackSideEffects(outcome)) {
    return {
      error: outcome.error,
      conflict: outcome.conflict,
      latestFeedback: outcome.latest ?? null,
    }
  }

  const commentChanged = didStudyFeedbackCommentChange({
    previousComment: outcome.previousComment,
    nextComment: comment,
    wasInsert: outcome.wasInsert,
  })

  if (commentChanged) {
    await supabase
      .from('study_day_feedback_reads')
      .delete()
      .eq('feedback_id', outcome.feedback.id)
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

  return {
    success: true,
    feedbackId: outcome.feedback.id,
    updatedAt: outcome.feedback.updated_at,
    stamp: outcome.feedback.stamp,
    comment: outcome.feedback.comment,
  }
}

/** Read current feedback for conflict recovery UI (does not mutate expected version). */
export async function fetchStudyDayFeedbackSnapshotForAdmin(
  studentId: string,
  studiedOn: string,
): Promise<
  | { ok: true; feedback: StudyDayFeedback | null }
  | { ok: false; error: string }
> {
  const access = await requireAdminAccess()
  if (!access.ok) return { ok: false, error: access.error }

  const canAccess = await assertAdminCanAccessStudent(studentId, access)
  if (!canAccess.ok) return { ok: false, error: canAccess.error }

  const latest = await fetchLatestFeedbackSnapshot(studentId, studiedOn)
  return { ok: true, feedback: latest }
}
