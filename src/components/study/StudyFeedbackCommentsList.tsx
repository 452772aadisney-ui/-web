'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  markAllUnreadStudyFeedbackRead,
  markStudyFeedbackRead,
} from '@/app/study/feedback-actions'
import { getStudyFeedbackStamp } from '@/lib/study/feedback'
import type { StudyFeedbackCommentListItem } from '@/lib/study/feedback-queries'
import { cn } from '@/lib/utils'

function formatStudiedOn(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return `${y}年${m}月${d}日`
}

function contextLabel(item: StudyFeedbackCommentListItem): string {
  if (item.textbookNames.length > 0) {
    return item.textbookNames.slice(0, 3).join('、') + (item.textbookNames.length > 3 ? '…' : '')
  }
  if (item.subjects.length > 0) {
    return item.subjects.slice(0, 3).join('、') + (item.subjects.length > 3 ? '…' : '')
  }
  return '記録なし'
}

export function StudyFeedbackCommentsList(props: {
  items: StudyFeedbackCommentListItem[]
  filter: 'unread' | 'all'
  unreadCount: number
  emptyMessage: string
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleMarkOne(feedbackId: string) {
    setError(null)
    setPendingId(feedbackId)
    const result = await markStudyFeedbackRead(feedbackId)
    setPendingId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    startTransition(() => router.refresh())
  }

  async function handleMarkAll() {
    setError(null)
    setBulkPending(true)
    const result = await markAllUnreadStudyFeedbackRead()
    setBulkPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <FilterLink active={props.filter === 'unread'} href="?filter=unread">
            未読
            {props.unreadCount > 0 ? `（${props.unreadCount}）` : ''}
          </FilterLink>
          <FilterLink active={props.filter === 'all'} href="?filter=all">
            すべて
          </FilterLink>
        </div>
        {props.unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={bulkPending}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-50"
          >
            {bulkPending ? '処理中…' : 'すべて既読にする'}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {props.items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          {props.emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3">
          {props.items.map((item) => {
            const stamp = getStudyFeedbackStamp(item.stamp)
            const marking = pendingId === item.feedbackId
            return (
              <li
                key={item.feedbackId}
                className={cn(
                  'rounded-xl border bg-card p-4 shadow-sm',
                  item.isUnread ? 'border-red-200 ring-1 ring-red-100' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {formatStudiedOn(item.studiedOn)}
                      </p>
                      {item.isUnread && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                          未読
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {stamp?.emoji} {stamp?.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{contextLabel(item)}</p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{item.comment}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/study/history?date=${item.studiedOn}`}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-primary hover:bg-card"
                  >
                    記録を開く
                  </Link>
                  {item.isUnread && (
                    <button
                      type="button"
                      onClick={() => void handleMarkOne(item.feedbackId)}
                      disabled={marking || bulkPending}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {marking ? '既読中…' : '既読にする'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function FilterLink(props: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={props.href}
      scroll={false}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition',
        props.active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border bg-background text-foreground hover:bg-card',
      )}
    >
      {props.children}
    </Link>
  )
}
