'use client'

import { useMemo, useState } from 'react'
import { ChatThreadList } from '@/components/chat/ChatThreadList'
import { filterAndSortAdminChatThreads } from '@/lib/chat/admin-chat-thread-filter'
import type { ChatThreadSummary } from '@/lib/chat/thread-list'

interface AdminChatThreadListClientProps {
  threads: ChatThreadSummary[]
}

export function AdminChatThreadListClient({ threads }: AdminChatThreadListClientProps) {
  const [query, setQuery] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const filtered = useMemo(
    () => filterAndSortAdminChatThreads(threads, { query, unreadOnly }),
    [threads, query, unreadOnly],
  )

  const hasFilters = query.trim().length > 0 || unreadOnly

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">生徒名で検索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="生徒名で検索"
            aria-label="生徒名で検索"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
            className="rounded border-border"
          />
          未読のみ
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted" role="status">
          {hasFilters
            ? '条件に合うトークが見つかりませんでした。'
            : '登録されている生徒がいません。'}
        </p>
      ) : (
        <ChatThreadList
          threads={filtered}
          hrefForThread={(studentId) => `/admin/chat/${studentId}`}
          previewLineClamp={2}
          emptyMessage="登録されている生徒がいません。"
        />
      )}
    </div>
  )
}
