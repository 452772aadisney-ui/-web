'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { setTodoCompletion } from '@/app/todo/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import { getTodayDateKey } from '@/lib/study/dates'
import type { UnlockedAchievement } from '@/lib/achievements/unlock'
import {
  APP_TOAST_SAFE_ERROR_MESSAGE,
  createToastSession,
} from '@/lib/toast/app-toast'
import { compareTodosByUrgency, getTodoUrgency } from '@/lib/todo/urgency'
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
  const [lastUnlockedAchievements, setLastUnlockedAchievements] = useState<UnlockedAchievement[]>([])
  const { dialog: achievementDialog } = useAchievementUnlockDialog(lastUnlockedAchievements)

  const handleToggle = async () => {
    if (pending) return

    const nextCompleted = !completed
    const previous = completed
    const toastSession = createToastSession()
    setCompleted(nextCompleted)
    setError(null)
    setPending(true)

    const result = await setTodoCompletion(category, taskId, nextCompleted)
    setPending(false)

    if (result.error) {
      setCompleted(previous)
      setError(result.error)
      toastSession.error(APP_TOAST_SAFE_ERROR_MESSAGE, 'todo-error')
      return
    }

    toastSession.success(
      nextCompleted ? 'ToDoを完了しました' : 'ToDoを未完了に戻しました',
      'todo-success',
    )

    if (result.unlockedAchievements?.length) {
      setLastUnlockedAchievements(result.unlockedAchievements)
    }

    router.refresh()
  }

  return (
    <>
      {achievementDialog}
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
    </>
  )
}

function TodoRow({ item, today }: { item: TodoItem; today: string }) {
  const urgency = getTodoUrgency(item, today)
  const isUrgent =
    urgency.kind === 'overdue' || urgency.kind === 'due_today' || urgency.kind === 'due_soon'

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border p-4',
        item.completed && 'bg-background opacity-70',
        urgency.kind === 'overdue' && 'border-red-200 bg-red-50/50',
        urgency.kind === 'due_today' && 'border-red-200 bg-red-50/40',
        urgency.kind === 'due_soon' && 'border-orange-200 bg-orange-50/40',
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
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              urgency.kind === 'overdue' || urgency.kind === 'due_today'
                ? 'bg-red-100 text-red-800'
                : urgency.kind === 'due_soon'
                  ? 'bg-orange-100 text-orange-800'
                  : urgency.kind === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-background text-muted',
            )}
          >
            {urgency.label}
          </span>
        </div>
        <p
          className={cn(
            'mt-1 font-medium',
            item.completed && 'line-through text-muted',
          )}
        >
          {item.title}
        </p>
        <p className={cn('mt-1 text-sm', isUrgent ? urgency.textClassName : 'text-muted')}>
          {urgency.label}
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

  const { pending, completed } = useMemo(() => {
    const pendingItems = items
      .filter((item) => !item.completed)
      .sort((a, b) => compareTodosByUrgency(a, b, today))
    const completedItems = items
      .filter((item) => item.completed)
      .sort((a, b) => compareTodosByUrgency(a, b, today))
    return { pending: pendingItems, completed: completedItems }
  }, [items, today])

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
        <h2 className="text-lg font-bold">未完了 ({pending.length})</h2>
        <p className="mt-1 text-sm text-muted">
          チェックを入れると「完了」になります。期限が近い順に表示しています。
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted">すべて完了しています。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map((item) => (
              <TodoRow key={item.id} item={item} today={today} />
            ))}
          </ul>
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
