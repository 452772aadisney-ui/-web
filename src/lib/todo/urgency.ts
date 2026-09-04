import type { TodoItem } from '@/types/todo'

export type TodoUrgencyKind =
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'normal'
  | 'none'
  | 'completed'

export interface TodoUrgency {
  kind: TodoUrgencyKind
  label: string
  textClassName: string
  sortOrder: number
}

/** Whole-day difference: dueDate - todayKey (negative = overdue). */
export function getDaysUntilDue(
  dueDate: string | null | undefined,
  todayKey: string,
): number | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null

  const [ty, tm, td] = todayKey.split('-').map(Number)
  const [dy, dm, dd] = dueDate.split('-').map(Number)
  const todayUtc = Date.UTC(ty!, tm! - 1, td!)
  const dueUtc = Date.UTC(dy!, dm! - 1, dd!)
  return Math.round((dueUtc - todayUtc) / 86_400_000)
}

export function getTodoUrgency(
  item: Pick<TodoItem, 'completed' | 'dueDate'>,
  todayKey: string,
): TodoUrgency {
  if (item.completed) {
    return {
      kind: 'completed',
      label: '完了',
      textClassName: 'text-muted',
      sortOrder: 5,
    }
  }

  const days = getDaysUntilDue(item.dueDate, todayKey)

  if (days === null) {
    return {
      kind: 'none',
      label: '期限なし',
      textClassName: 'text-muted',
      sortOrder: 4,
    }
  }

  if (days < 0) {
    return {
      kind: 'overdue',
      label: `${-days}日超過`,
      textClassName: 'text-red-700',
      sortOrder: 0,
    }
  }

  if (days === 0) {
    return {
      kind: 'due_today',
      label: '今日まで',
      textClassName: 'text-red-700',
      sortOrder: 1,
    }
  }

  if (days <= 3) {
    return {
      kind: 'due_soon',
      label: `あと${days}日`,
      textClassName: 'text-orange-600',
      sortOrder: 2,
    }
  }

  const [, month, day] = item.dueDate.split('-')
  return {
    kind: 'normal',
    label: `${Number(month)}月${Number(day)}日まで`,
    textClassName: 'text-muted',
    sortOrder: 3,
  }
}

export function compareTodosByUrgency(
  a: Pick<TodoItem, 'completed' | 'dueDate'>,
  b: Pick<TodoItem, 'completed' | 'dueDate'>,
  todayKey: string,
): number {
  const urgencyA = getTodoUrgency(a, todayKey)
  const urgencyB = getTodoUrgency(b, todayKey)
  if (urgencyA.sortOrder !== urgencyB.sortOrder) {
    return urgencyA.sortOrder - urgencyB.sortOrder
  }
  return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
}

export function countOverdueTodos(
  items: Array<Pick<TodoItem, 'completed' | 'dueDate'>>,
  todayKey: string,
): number {
  return items.filter((item) => getTodoUrgency(item, todayKey).kind === 'overdue').length
}
