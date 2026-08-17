'use client'

import { useActionState, useState } from 'react'
import { registerStudentQuizzes, type QuizActionState } from '@/app/quizzes/actions'
import { AdminStudentCheckboxGroups } from '@/components/textbooks/AdminStudentCheckboxGroups'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type { StudentListGroup } from '@/lib/tags/grade-order'

const initialState: QuizActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function AdminQuizRegisterForm({
  studentGroups,
  defaultSelectedStudentIds = [],
  submitLabel = '登録',
}: {
  studentGroups: StudentListGroup[]
  defaultSelectedStudentIds?: string[]
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState(registerStudentQuizzes, initialState)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(defaultSelectedStudentIds),
  )

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(group: StudentListGroup) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = group.students.every((student) => next.has(student.id))
      for (const student of group.students) {
        if (allSelected) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {[...selectedIds].map((studentId) => (
        <input key={studentId} type="hidden" name="targetStudentIds" value={studentId} />
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">教科</span>
          <select name="subject" defaultValue="" className={fieldClass}>
            <option value="">—</option>
            {EXAM_SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">満点 *</span>
          <input
            type="number"
            name="maxScore"
            min={1}
            step={1}
            required
            defaultValue={100}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">実施日 *</span>
          <input type="date" name="scheduledOn" required className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">説明</span>
          <input name="description" className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">メモ</span>
          <input name="note" className={fieldClass} />
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">対象生徒 *</p>
        <AdminStudentCheckboxGroups
          studentGroups={studentGroups}
          selectedIds={selectedIds}
          onToggleStudent={toggleStudent}
          onToggleGroup={toggleGroup}
          inputName=""
        />
        <p className="mt-2 text-xs text-muted">
          選択した生徒ごとに小テストを登録します。Googleカレンダーにも反映されます。
        </p>
      </div>

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">小テストを登録しました</p>}

      <button
        type="submit"
        disabled={pending || selectedIds.size === 0}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : submitLabel}
      </button>
    </form>
  )
}
