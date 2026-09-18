import { describe, expect, it } from 'vitest'
import {
  hasReadableStudyFeedbackComment,
  isStudyFeedbackUnread,
} from '@/lib/study/feedback-unread'

describe('study feedback unread definition', () => {
  it('treats only non-empty trimmed comments as readable', () => {
    expect(hasReadableStudyFeedbackComment('  hi  ')).toBe(true)
    expect(hasReadableStudyFeedbackComment('')).toBe(false)
    expect(hasReadableStudyFeedbackComment('   ')).toBe(false)
    expect(hasReadableStudyFeedbackComment(null)).toBe(false)
  })

  it('is unread only when readable and not read', () => {
    expect(isStudyFeedbackUnread({ comment: 'ok', hasRead: false })).toBe(true)
    expect(isStudyFeedbackUnread({ comment: 'ok', hasRead: true })).toBe(false)
    expect(isStudyFeedbackUnread({ comment: '', hasRead: false })).toBe(false)
  })
})
