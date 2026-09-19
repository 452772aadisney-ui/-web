/**
 * Shared unread definition for study-day feedback comments.
 * Badge counts and the comments list must use the same rules.
 *
 * Unread iff:
 * - trimmed comment is non-empty, AND
 * - no matching read snapshot for (feedback_id, student_id), OR
 * - comment_at_read differs from the current comment (content changed after read)
 *
 * Stamp-only feedback (empty comment) is never unread.
 * Content-unchanged admin re-save must keep the same comment so reads stay valid.
 */
export function hasReadableStudyFeedbackComment(
  comment: string | null | undefined,
): boolean {
  return String(comment ?? '').trim().length > 0
}

export function normalizeFeedbackCommentForRead(
  comment: string | null | undefined,
): string {
  return String(comment ?? '').trim()
}

export function isStudyFeedbackUnread(params: {
  comment: string | null | undefined
  /** null/undefined = no read row */
  commentAtRead?: string | null
  /** @deprecated prefer commentAtRead; true means read with unknown snapshot (legacy) */
  hasRead?: boolean
}): boolean {
  if (!hasReadableStudyFeedbackComment(params.comment)) return false

  const current = normalizeFeedbackCommentForRead(params.comment)

  if (params.commentAtRead !== undefined && params.commentAtRead !== null) {
    return normalizeFeedbackCommentForRead(params.commentAtRead) !== current
  }

  // Legacy callers that only pass hasRead (pre-comment_at_read).
  if (params.hasRead === true) return false
  if (params.hasRead === false) return true

  // No read row
  return true
}
