import Link from 'next/link'
import { getPersonName } from '@/lib/auth/display-name'
import { formatChatThreadTime } from '@/lib/chat/format'
import type { ChatThreadSummary } from '@/lib/chat/thread-list'
import { cn } from '@/lib/utils'

function ThreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

interface ChatThreadListProps {
  threads: ChatThreadSummary[]
  hrefForThread: (studentId: string) => string
  emptyMessage?: string
}

export function ChatThreadList({
  threads,
  hrefForThread,
  emptyMessage = 'トークがありません。',
}: ChatThreadListProps) {
  if (threads.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {threads.map((thread) => {
        const name =
          thread.full_name === '管理者' && thread.display_name === '管理者'
            ? '管理者'
            : getPersonName(thread)

        return (
          <li key={thread.studentId}>
            <Link
              href={hrefForThread(thread.studentId)}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-background"
            >
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  thread.full_name === '管理者'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-primary',
                )}
                aria-hidden
              >
                {name.slice(0, 1)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('truncate font-medium', thread.unreadCount > 0 && 'text-foreground')}>
                    {name}
                  </p>
                  {thread.lastMessageAt && (
                    <span className="shrink-0 text-xs text-muted">
                      {formatChatThreadTime(thread.lastMessageAt)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'truncate text-sm',
                      thread.unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted',
                    )}
                  >
                    {thread.lastMessage ?? 'メッセージはまだありません'}
                  </p>
                  <ThreadBadge count={thread.unreadCount} />
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
