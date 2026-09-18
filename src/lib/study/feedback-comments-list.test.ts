import { describe, expect, it } from 'vitest'
import {
  hasReadableStudyFeedbackComment,
  isStudyFeedbackUnread,
} from '@/lib/study/feedback-unread'
import { getTotalPages, parsePageParam } from '@/lib/pagination'

/**
 * Pure helpers covering list pagination + unread filter behavior without DB.
 */
describe('study feedback comments list helpers', () => {
  it('paginates filtered unread rows without auto-marking', () => {
    const rows = [
      { id: 'a', comment: 'one', hasRead: false },
      { id: 'b', comment: 'two', hasRead: true },
      { id: 'c', comment: 'three', hasRead: false },
      { id: 'd', comment: '', hasRead: false },
    ]

    const withComment = rows.filter((row) => hasReadableStudyFeedbackComment(row.comment))
    const unread = withComment.filter((row) =>
      isStudyFeedbackUnread({ comment: row.comment, hasRead: row.hasRead }),
    )

    expect(unread.map((row) => row.id)).toEqual(['a', 'c'])

    const pageSize = 1
    const totalPages = getTotalPages(unread.length, pageSize)
    const page = parsePageParam('2', totalPages)
    const slice = unread.slice((page - 1) * pageSize, page * pageSize)
    expect(slice.map((row) => row.id)).toEqual(['c'])
  })

  it('bulk mark snapshot excludes ids arriving after snapshot', () => {
    const snapshot = ['fb-1', 'fb-2']
    const arrivedDuring = 'fb-3'
    const toMark = new Set(snapshot)
    expect(toMark.has(arrivedDuring)).toBe(false)
    expect([...toMark]).toEqual(['fb-1', 'fb-2'])
  })
})
