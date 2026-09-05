import { getPersonName } from '@/lib/auth/display-name'
import type { ChatThreadSummary } from '@/lib/chat/thread-list'

export function filterAdminChatThreads(
  threads: ChatThreadSummary[],
  options: { query: string; unreadOnly: boolean },
): ChatThreadSummary[] {
  const q = options.query.trim().toLowerCase()

  return threads.filter((thread) => {
    if (options.unreadOnly && thread.unreadCount <= 0) return false
    if (!q) return true

    const name = getPersonName(thread).toLowerCase()
    return name.includes(q)
  })
}

/** Unread first, then lastMessageAt descending (nulls last). */
export function sortAdminChatThreads(threads: ChatThreadSummary[]): ChatThreadSummary[] {
  return [...threads].sort((a, b) => {
    const unreadDiff = Number(b.unreadCount > 0) - Number(a.unreadCount > 0)
    if (unreadDiff !== 0) return unreadDiff

    const aAt = a.lastMessageAt ?? ''
    const bAt = b.lastMessageAt ?? ''
    if (aAt === bAt) return 0
    if (!aAt) return 1
    if (!bAt) return -1
    return bAt.localeCompare(aAt)
  })
}

export function filterAndSortAdminChatThreads(
  threads: ChatThreadSummary[],
  options: { query: string; unreadOnly: boolean },
): ChatThreadSummary[] {
  return sortAdminChatThreads(filterAdminChatThreads(threads, options))
}
