'use client'

import { useActionState, useMemo, useState } from 'react'
import {
  createTextbooksForStudents,
  type TextbookActionState,
} from '@/app/textbooks/actions'
import { AdminStudentCheckboxGroups } from '@/components/textbooks/AdminStudentCheckboxGroups'
import {
  TextbookDateFields,
  UsageTagFields,
  inputClass,
} from '@/components/textbooks/TextbookFormFields'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type { TextbookCatalog } from '@/types/textbook'

const initialState: TextbookActionState = {}

interface AdminBulkTextbookRegisterProps {
  studentGroups: StudentListGroup[]
  catalog: TextbookCatalog[]
}

export function AdminBulkTextbookRegister({
  studentGroups,
  catalog,
}: AdminBulkTextbookRegisterProps) {
  const [state, formAction, pending] = useActionState(createTextbooksForStudents, initialState)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [catalogId, setCatalogId] = useState('')
  const [mode, setMode] = useState<'catalog' | 'manual'>('catalog')

  const selectedCatalog = useMemo(
    () => catalog.find((item) => item.id === catalogId) ?? null,
    [catalog, catalogId],
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

  if (studentGroups.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4 rounded-lg border border-border bg-background p-4">
        <h3 className="font-medium">参考書の内容</h3>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('catalog')}
            className={`rounded-lg px-3 py-2 text-sm ${mode === 'catalog' ? 'bg-primary text-white' : 'border border-border'}`}
          >
            本棚から選ぶ
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`rounded-lg px-3 py-2 text-sm ${mode === 'manual' ? 'bg-primary text-white' : 'border border-border'}`}
          >
            新規入力
          </button>
        </div>

        {mode === 'catalog' ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">本棚の参考書</span>
            <select
              name="catalogId"
              value={catalogId}
              onChange={(event) => setCatalogId(event.target.value)}
              required={mode === 'catalog'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            >
              <option value="">選択してください</option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.visibility === 'public' ? '公開' : '非公開'}）
                </option>
              ))}
            </select>
            {selectedCatalog && (
              <p className="mt-2 text-xs text-muted">
                {selectedCatalog.subjects.join('・')}
                {selectedCatalog.usage_tags.length > 0
                  ? ` / ${selectedCatalog.usage_tags.join('・')}`
                  : ''}
              </p>
            )}
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">教材名</span>
              <input type="text" name="name" required={mode === 'manual'} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">科目タグ（カンマ区切り）</span>
              <input type="text" name="subjects" required={mode === 'manual'} className={inputClass} />
            </label>
          </>
        )}

        <UsageTagFields selectedUsageTags={selectedCatalog?.usage_tags} />
        <TextbookDateFields />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold">生徒を選択</h3>
        <p className="text-xs text-muted">学年ごとに表示しています。複数人を同時に選択できます。</p>
        <AdminStudentCheckboxGroups
          studentGroups={studentGroups}
          selectedIds={selectedIds}
          onToggleStudent={toggleStudent}
          onToggleGroup={toggleGroup}
        />
      </section>

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">選択した生徒に参考書を登録しました</p>}

      <button
        type="submit"
        disabled={pending || selectedIds.size === 0}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : `選択した${selectedIds.size}人に参考書を登録`}
      </button>

      <p className="text-xs text-muted">
        登録した参考書の開始日・終了予定日は、生徒のカレンダーに自動で表示されます。
      </p>
    </form>
  )
}
