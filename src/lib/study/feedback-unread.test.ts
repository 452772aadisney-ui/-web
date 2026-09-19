import { describe, expect, it } from 'vitest'
import {
  hasReadableStudyFeedbackComment,
  isStudyFeedbackUnread,
  normalizeFeedbackCommentForRead,
} from '@/lib/study/feedback-unread'

describe('feedback unread helpers', () => {
  it('detects readable comments', () => {
    expect(hasReadableStudyFeedbackComment('  hi  ')).toBe(true)
    expect(hasReadableStudyFeedbackComment('')).toBe(false)
    expect(hasReadableStudyFeedbackComment('   ')).toBe(false)
    expect(hasReadableStudyFeedbackComment(null)).toBe(false)
  })

  it('treats missing read as unread when comment exists', () => {
    expect(
      isStudyFeedbackUnread({ comment: 'ok', commentAtRead: null, hasRead: false }),
    ).toBe(true)
    expect(isStudyFeedbackUnread({ comment: '', hasRead: false })).toBe(false)
  })

  it('keeps read when comment_at_read matches current comment', () => {
    expect(
      isStudyFeedbackUnread({
        comment: '  hello  ',
        commentAtRead: 'hello',
        hasRead: true,
      }),
    ).toBe(false)
  })

  it('re-unreads when comment changed after mark-read', () => {
    expect(
      isStudyFeedbackUnread({
        comment: 'new text',
        commentAtRead: 'old text',
        hasRead: true,
      }),
    ).toBe(true)
  })

  it('does not re-unread on content-unchanged normalize', () => {
    expect(normalizeFeedbackCommentForRead('  a  ')).toBe('a')
    expect(
      isStudyFeedbackUnread({
        comment: 'a',
        commentAtRead: normalizeFeedbackCommentForRead('  a  '),
      }),
    ).toBe(false)
  })
})
