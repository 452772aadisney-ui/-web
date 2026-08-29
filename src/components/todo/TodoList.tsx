'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { setTodoCompletion } from '@/app/todo/actions'
import { getTodayDateKey } from '@/lib/study/dates'
import { cn } from '@/lib/utils'
import type { TodoCategory, TodoItem } from '@/types/todo'

const CATEGORY_LABELS: Record<TodoCategory, string> = {
  homework: '宿題',
  quiz: '小テスト',
  application: '申込関連',
}

const CATEGORY_COLORS: Record<TodoCategory, string> = {
  homework: 'bg-blue-100 text-blue-800',
  quiz: 'bg-orange-100 text-orange-800',
  application: 'bg-purple-100 text-purple-800',
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function TodoCheckbox({
  category,
  taskId,
  initialCompleted,
}: {
  category: TodoCategory
  taskId: string
  initialCompleted: boolean
}) {
  const router = useRouter()
  const [completed, setCompleted] = useState(initialCompleted)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    if (pending) return

    const nextCompleted = !completed
    const previous = completed
    setCompleted(nextCompleted)
    setError(null)
    setPending(true)

    const result = await setTodoCompletion(category, taskId, nextCompleted)
    setPending(false)

    if (result.error) {
      setCompleted(previous)
      setError(result.error)
      return
    }

    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-label={completed ? 'ToDo を未完了に戻す' : 'ToDo を完了にする'}
      aria-pressed={completed}
      title={error ?? undefined}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
        completed
          ? 'border-green-600 bg-green-600 text-white'
          : 'border-border bg-card text-transparent hover:border-muted',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('h-3 w-3', completed ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </button>
  )
}

function TodoRow({ item, today }: { item: TodoItem; today: string }) {
  const isOverdue = !item.completed && item.dueDate < today

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border p-4',
        item.completed && 'bg-background opacity-70',
        isOverdue && !item.completed && 'border-red-200 bg-red-50/50',
      )}
    >
      <TodoCheckbox
        category={item.category}
        taskId={item.sourceId}
        initialCompleted={item.completed}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              CATEGORY_COLORS[item.category],
            )}
          >
            {CATEGORY_LABELS[item.category]}
          </span>
          {item.completed && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              完了
            </span>
          )}
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              期限超過
            </span>
          )}
        </div>
        <p
          className={cn(
            'mt-1 font-medium',
            item.completed && 'line-through text-muted',
          )}
        >
          {item.title}
        </p>
        <p className={cn('mt-1 text-sm', isOverdue ? 'text-red-700' : 'text-muted')}>
          期日: {formatDate(item.dueDate)}
          {item.subject ? ` / ${item.subject}` : ''}
        </p>
        {item.description && (
          <p className="mt-1 text-xs text-muted">{item.description}</p>
        )}
      </div>
    </li>
  )
}

interface TodoListProps {
  items: TodoItem[]
}

export function TodoList({ items }: TodoListProps) {
  const today = getTodayDateKey()

  const { pending, completed, byCategory } = useMemo(() => {
    const pendingItems = items.filter((i) => !i.completed)
    const completedItems = items.filter((i) => i.completed)
    const categories: TodoCategory[] = ['homework', 'quiz', 'application']
    const grouped = Object.fromEntries(
      categories.map((c) => [c, pendingItems.filter((i) => i.category === c)]),
    ) as Record<TodoCategory, TodoItem[]>
    return { pending: pendingItems, completed: completedItems, byCategory: grouped }
  }, [items])

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
        現在、ToDo はありません。
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">
          未完了 ({pending.length})
        </h2>
        <p className="mt-1 text-sm text-muted">
          チェックを入れると「完了」になります。
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted">すべて完了しています。</p>
        ) : (
          <div className="mt-4 space-y-6">
            {(['homework', 'quiz', 'application'] as TodoCategory[]).map((category) =>
              byCategory[category].length > 0 ? (
                <div key={category}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <ul className="space-y-2">
                    {byCategory[category].map((item) => (
                      <TodoRow key={item.id} item={item} today={today} />
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">完了済み ({completed.length})</h2>
          <ul className="mt-4 space-y-2">
            {completed.map((item) => (
              <TodoRow key={item.id} item={item} today={today} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
