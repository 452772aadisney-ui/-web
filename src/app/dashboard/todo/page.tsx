import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TodoList } from '@/components/todo/TodoList'
import { buildTodoItems } from '@/lib/todo/build-items'
import {
  fetchApplicationTasksForStudent,
  fetchTodoCompletionsForStudent,
} from '@/lib/todo/queries'
import {
  fetchHomeworkTasksForStudent,
  fetchQuizSchedulesForStudent,
} from '@/lib/schedule/queries'

export default async function StudentTodoPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const [homework, quizzes, applications, completions] = await Promise.all([
    fetchHomeworkTasksForStudent(profile.id),
    fetchQuizSchedulesForStudent(profile.id),
    fetchApplicationTasksForStudent(profile.id),
    fetchTodoCompletionsForStudent(profile.id),
  ])

  const items = buildTodoItems(homework, quizzes, applications, completions)

  return (
    <StudentPageShell title="ToDoリスト" backHref="/dashboard" backLabel="マイページ">
      <p className="mb-6 text-sm text-muted">
        宿題・小テスト・申込関連のやるべきことと期日を確認できます。
      </p>
      <TodoList items={items} />
    </StudentPageShell>
  )
}
