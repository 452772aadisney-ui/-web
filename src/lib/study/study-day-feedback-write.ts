import type { StudyFeedbackStampId } from '@/lib/study/feedback'

export const STUDY_FEEDBACK_CONFLICT_MESSAGE =
  '他の管理者が先に対応しました。入力中の内容は保持しています。最新内容を確認してから再度保存してください。'

export const STUDY_FEEDBACK_VERSION_REQUIRED_MESSAGE =
  '保存の前提バージョンがありません。最新内容を確認してから再度保存してください。'

export type StudyDayFeedbackWriteIntent =
  | { type: 'insert' }
  | { type: 'update'; id: string; expectedUpdatedAt: string }

export type StudyDayFeedbackLatestSnapshot = {
  id: string
  stamp: StudyFeedbackStampId
  comment: string
  updated_at: string
  created_at: string
  admin_id: string
  student_id: string
  studied_on: string
}

export type StudyDayFeedbackWriteSuccess = {
  ok: true
  feedback: StudyDayFeedbackLatestSnapshot
  /** Comment present before this successful write (empty string for insert). */
  previousComment: string
  wasInsert: boolean
}

export type StudyDayFeedbackWriteFailure = {
  ok: false
  conflict: boolean
  error: string
  latest?: StudyDayFeedbackLatestSnapshot | null
}

export type StudyDayFeedbackWriteOutcome =
  | StudyDayFeedbackWriteSuccess
  | StudyDayFeedbackWriteFailure

/** Decide insert vs conditional update from form expectation fields. */
export function resolveStudyDayFeedbackWriteIntent(params: {
  expectedFeedbackId: string
  expectedUpdatedAt: string
}): StudyDayFeedbackWriteIntent | { error: string; conflict: true } {
  const id = params.expectedFeedbackId.trim()
  const updatedAt = params.expectedUpdatedAt.trim()

  if (!id) {
    return { type: 'insert' }
  }

  if (!updatedAt) {
    return { error: STUDY_FEEDBACK_VERSION_REQUIRED_MESSAGE, conflict: true }
  }

  return { type: 'update', id, expectedUpdatedAt: updatedAt }
}

export function isPgUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505'
}

export function interpretInsertResult(params: {
  error: { code?: string | null; message?: string } | null
  row: StudyDayFeedbackLatestSnapshot | null
}): StudyDayFeedbackWriteOutcome {
  if (params.error && isPgUniqueViolation(params.error)) {
    return {
      ok: false,
      conflict: true,
      error: STUDY_FEEDBACK_CONFLICT_MESSAGE,
    }
  }
  if (params.error || !params.row) {
    return {
      ok: false,
      conflict: false,
      error: 'フィードバックの保存に失敗しました',
    }
  }
  return {
    ok: true,
    feedback: params.row,
    previousComment: '',
    wasInsert: true,
  }
}

/**
 * Conditional UPDATE must match id + expectedUpdatedAt.
 * Zero rows ⇒ conflict (another writer changed the version).
 * previousComment must come from the protected pre-image, not a post-write SELECT.
 */
export function interpretConditionalUpdateResult(params: {
  error: { code?: string | null; message?: string } | null
  updatedRow: StudyDayFeedbackLatestSnapshot | null
  previousComment: string
}): StudyDayFeedbackWriteOutcome {
  if (params.error) {
    return {
      ok: false,
      conflict: false,
      error: 'フィードバックの保存に失敗しました',
    }
  }
  if (!params.updatedRow) {
    return {
      ok: false,
      conflict: true,
      error: STUDY_FEEDBACK_CONFLICT_MESSAGE,
    }
  }
  return {
    ok: true,
    feedback: params.updatedRow,
    previousComment: params.previousComment,
    wasInsert: false,
  }
}

/** Side effects run only after a confirmed successful write. */
export function shouldRunStudyFeedbackSideEffects(
  outcome: StudyDayFeedbackWriteOutcome,
): outcome is StudyDayFeedbackWriteSuccess {
  return outcome.ok
}

export function didStudyFeedbackCommentChange(params: {
  previousComment: string
  nextComment: string
  wasInsert: boolean
}): boolean {
  if (params.wasInsert) return true
  return params.previousComment.trim() !== params.nextComment.trim()
}
