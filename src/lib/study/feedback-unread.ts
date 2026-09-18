/**
 * Shared unread definition for study-day feedback comments.
 * Badge counts and the comments list must use the same rules.
 *
 * Unread iff:
 * - trimmed comment is non-empty, AND
 * - no row in study_day_feedback_reads for (feedback_id, student_id)
 *
 * Stamp-only feedback (empty comment) is never unread.
 */
export function hasReadableStudyFeedbackComment(
  comment: string | null | undefined,
): boolean {
  return String(comment ?? '').trim().length > 0
}

export function isStudyFeedbackUnread(params: {
  comment: string | null | undefined
  hasRead: boolean
}): boolean {
  return hasReadableStudyFeedbackComment(params.comment) && !params.hasRead
}
