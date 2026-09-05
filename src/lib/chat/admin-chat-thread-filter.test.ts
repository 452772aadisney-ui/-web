import { describe, expect, it } from 'vitest'
import {
  filterAdminChatThreads,
  filterAndSortAdminChatThreads,
  sortAdminChatThreads,
} from '@/lib/chat/admin-chat-thread-filter'
import type { ChatThreadSummary } from '@/lib/chat/thread-list'

function thread(
  partial: Partial<ChatThreadSummary> & Pick<ChatThreadSummary, 'studentId' | 'full_name'>,
): ChatThreadSummary {
  return {
    display_name: partial.full_name,
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
    ...partial,
  }
}

describe('admin chat thread filter/sort', () => {
  const threads = [
    thread({
      studentId: '1',
      full_name: '山田太郎',
      unreadCount: 0,
      lastMessageAt: '2024-03-01T10:00:00.000Z',
    }),
    thread({
      studentId: '2',
      full_name: '佐藤花子',
      unreadCount: 2,
      lastMessageAt: '2024-02-01T10:00:00.000Z',
    }),
    thread({
      studentId: '3',
      full_name: '鈴木一郎',
      unreadCount: 1,
      lastMessageAt: '2024-04-01T10:00:00.000Z',
    }),
  ]

  it('filters by name query', () => {
    expect(filterAdminChatThreads(threads, { query: '佐藤', unreadOnly: false })).toHaveLength(1)
  })

  it('filters unread only', () => {
    expect(filterAdminChatThreads(threads, { query: '', unreadOnly: true })).toHaveLength(2)
  })

  it('sorts unread first then lastMessageAt desc', () => {
    const sorted = sortAdminChatThreads(threads)
    expect(sorted.map((t) => t.studentId)).toEqual(['3', '2', '1'])
  })

  it('combines filter and sort', () => {
    const result = filterAndSortAdminChatThreads(threads, { query: '', unreadOnly: true })
    expect(result.map((t) => t.studentId)).toEqual(['3', '2'])
  })
})
