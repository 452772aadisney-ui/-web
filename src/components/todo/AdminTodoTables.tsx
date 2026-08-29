import { getPersonName } from '@/lib/auth/display-name'
import type { HomeworkTask } from '@/types/schedule'
import type { HomeworkCompletion, TodoCategory, TodoItem } from '@/types/todo'

const CATEGORY_LABELS: Record<TodoCategory, string> = {
  homework: '宿題',
  quiz: '小テスト',
  application: '申込関連',
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

interface AdminStudentTodoTableProps {
  items: TodoItem[]
}

export function AdminStudentTodoTable({ items }: AdminStudentTodoTableProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">登録されている ToDo はありません。</p>
  }

  const incompleteCount = items.filter((item) => !item.completed).length

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        未完了: <span className="font-bold text-red-700">{incompleteCount}</span> 件
        {' / '}
        完了: <span className="font-bold text-green-700">{items.length - incompleteCount}</span> 件
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="pb-2 pr-4 font-medium">種別</th>
              <th className="pb-2 pr-4 font-medium">タイトル</th>
              <th className="pb-2 pr-4 font-medium">教科</th>
              <th className="pb-2 pr-4 font-medium">期日</th>
              <th className="pb-2 font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-3 pr-4 text-muted">{CATEGORY_LABELS[item.category]}</td>
                <td className="py-3 pr-4 font-medium">{item.title}</td>
                <td className="py-3 pr-4 text-muted">{item.subject ?? '—'}</td>
                <td className="py-3 pr-4 text-muted">{formatDate(item.dueDate)}</td>
                <td className="py-3">
                  {item.completed ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      完了
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      未完了
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface HomeworkCompletionOverviewProps {
  tasks: HomeworkTask[]
  students: Array<{ id: string; full_name: string; display_name: string }>
  completions: HomeworkCompletion[]
}

export function HomeworkCompletionOverview({
  tasks,
  students,
  completions,
}: HomeworkCompletionOverviewProps) {
  if (tasks.length === 0 || students.length === 0) return null

  const completionMap = new Map<string, Set<string>>()
  for (const c of completions) {
    const set = completionMap.get(c.homework_task_id) ?? new Set()
    set.add(c.student_id)
    completionMap.set(c.homework_task_id, set)
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-background">
          <tr className="border-b border-border text-muted">
            <th className="px-4 py-3 font-medium">宿題</th>
            <th className="px-4 py-3 font-medium">期日</th>
            <th className="px-4 py-3 font-medium">未完了の生徒</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((task) => {
            const completedStudentIds = completionMap.get(task.id) ?? new Set()
            const incomplete = students.filter((s) => !completedStudentIds.has(s.id))
            return (
              <tr key={task.id}>
                <td className="px-4 py-3 font-medium">{task.title}</td>
                <td className="px-4 py-3 text-muted">{formatDate(task.due_date)}</td>
                <td className="px-4 py-3">
                  {incomplete.length === 0 ? (
                    <span className="text-green-700">全員完了</span>
                  ) : (
                    <span className="text-red-700">
                      {incomplete.map((s) => getPersonName(s)).join('、')}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
