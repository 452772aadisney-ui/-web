import { describe, expect, it } from 'vitest'
import {
  compareTodosByUrgency,
  countOverdueTodos,
  getDaysUntilDue,
  getTodoUrgency,
} from '@/lib/todo/urgency'

describe('todo urgency', () => {
  const today = '2026-09-04'

  it('computes day differences', () => {
    expect(getDaysUntilDue('2026-09-01', today)).toBe(-3)
    expect(getDaysUntilDue('2026-09-04', today)).toBe(0)
    expect(getDaysUntilDue('2026-09-07', today)).toBe(3)
    expect(getDaysUntilDue('', today)).toBeNull()
  })

  it('formats urgency labels', () => {
    expect(getTodoUrgency({ completed: false, dueDate: '2026-09-01' }, today).label).toBe(
      '3日超過',
    )
    expect(getTodoUrgency({ completed: false, dueDate: '2026-09-04' }, today).label).toBe(
      '今日まで',
    )
    expect(getTodoUrgency({ completed: false, dueDate: '2026-09-06' }, today).label).toBe(
      'あと2日',
    )
    expect(getTodoUrgency({ completed: false, dueDate: '2026-09-20' }, today).label).toBe(
      '9月20日まで',
    )
  })

  it('sorts overdue before due-soon before normal', () => {
    const items = [
      { completed: false, dueDate: '2026-09-20' },
      { completed: false, dueDate: '2026-09-01' },
      { completed: false, dueDate: '2026-09-06' },
      { completed: true, dueDate: '2026-09-01' },
    ]
    const sorted = [...items].sort((a, b) => compareTodosByUrgency(a, b, today))
    expect(sorted.map((item) => item.dueDate)).toEqual([
      '2026-09-01',
      '2026-09-06',
      '2026-09-20',
      '2026-09-01',
    ])
    expect(sorted[3]?.completed).toBe(true)
  })

  it('counts overdue incomplete items', () => {
    expect(
      countOverdueTodos(
        [
          { completed: false, dueDate: '2026-09-01' },
          { completed: true, dueDate: '2026-08-01' },
          { completed: false, dueDate: '2026-09-10' },
        ],
        today,
      ),
    ).toBe(1)
  })
})
