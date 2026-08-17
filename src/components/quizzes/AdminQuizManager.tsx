'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  createQuizMaster,
  deleteQuizMaster,
  updateQuizMaster,
  type QuizActionState,
} from '@/app/quizzes/actions'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type { QuizAssignmentListItem, QuizMaster } from '@/types/quiz'

const initialState: QuizActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function QuizMasterForm({
  master,
  onCancel,
}: {
  master?: QuizMaster
  onCancel?: () => void
}) {
  const action = master ? updateQuizMaster : createQuizMaster
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {master && <input type="hidden" name="id" value={master.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required defaultValue={master?.title ?? ''} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">教科</span>
          <select name="subject" defaultValue={master?.subject ?? ''} className={fieldClass}>
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
            defaultValue={master?.max_score ?? 100}
            className={fieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">説明</span>
          <input name="description" defaultValue={master?.description ?? ''} className={fieldClass} />
        </label>
        {master && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={master.is_active} className="accent-primary" />
            有効
          </label>
        )}
      </div>
      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">保存しました</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : master ? '更新' : '登録'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-muted">
            キャンセル
          </button>
        )}
      </div>
    </form>
  )
}

export function AdminQuizManager({
  masters,
  assignments,
}: {
  masters: QuizMaster[]
  assignments: QuizAssignmentListItem[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-bold">小テストを登録</h3>
          <p className="mt-1 text-sm text-muted">名称・教科・満点を登録します。</p>
        </div>
        <QuizMasterForm />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-bold">登録済みの小テスト</h3>
          <p className="mt-1 text-sm text-muted">
            生徒への割り当ては生徒一覧から行います。実施記録は下の表から点数入力へ進めます。
          </p>
        </div>
        {masters.length === 0 ? (
          <p className="text-sm text-muted">登録されている小テストはありません。</p>
        ) : (
          <div className="space-y-3">
            {masters.map((master) => (
              <div key={master.id} className="rounded-lg border border-border">
                {editingId === master.id ? (
                  <div className="p-4">
                    <QuizMasterForm master={master} onCancel={() => setEditingId(null)} />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">
                        {master.title}
                        {!master.is_active && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                            無効
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {master.subject || '教科未設定'} / 満点 {master.max_score}
                        {master.description ? ` / ${master.description}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(master.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        編集
                      </button>
                      <form action={deleteQuizMaster}>
                        <input type="hidden" name="id" value={master.id} />
                        <button type="submit" className="text-xs text-error hover:underline">
                          削除
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-bold">実施記録</h3>
          <p className="mt-1 text-sm text-muted">生徒ごとに登録された小テストの点数を入力できます。</p>
        </div>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted">実施記録はまだありません。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-background">
                <tr className="border-b border-border text-muted">
                  <th className="px-4 py-3 font-medium">小テスト</th>
                  <th className="px-4 py-3 font-medium">生徒</th>
                  <th className="px-4 py-3 font-medium">実施日</th>
                  <th className="px-4 py-3 font-medium">点数</th>
                  <th className="px-4 py-3 font-medium">入力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{assignment.master.title}</p>
                      <p className="text-xs text-muted">
                        {assignment.master.subject || '教科未設定'} / 満点 {assignment.master.max_score}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {assignment.student_names.join('、') || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(assignment.scheduled_on)}</td>
                    <td className="px-4 py-3 text-muted">
                      {assignment.scored_count}/{assignment.student_count} 入力済
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/quizzes/assignments/${assignment.id}`}
                        className="text-primary hover:underline"
                      >
                        点数を入力
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
