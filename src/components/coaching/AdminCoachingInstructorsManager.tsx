'use client'

import { useActionState, useState, type FormEvent } from 'react'
import {
  createCoachingCoach,
  deleteCoachingCoach,
  updateCoachingCoach,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachProfileFields } from '@/components/coaching/CoachProfileFields'
import { useActionToast } from '@/hooks/useActionToast'
import type { CoachingCoach } from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function CoachForm({
  coach,
  onCancel,
  onDeleted,
}: {
  coach?: CoachingCoach
  onCancel?: () => void
  onDeleted?: () => void
}) {
  const action = coach ? updateCoachingCoach : createCoachingCoach
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, { successMessage: '保存しました' })

  function handleDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm('本当に削除しますか？')) {
      event.preventDefault()
      return
    }
    onDeleted?.()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <form action={formAction} className="space-y-3">
        {coach && <input type="hidden" name="id" value={coach.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">講師名 *</span>
            <input name="name" required defaultValue={coach?.name ?? ''} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">表示順</span>
            <input
              type="number"
              name="sortOrder"
              defaultValue={coach?.sort_order ?? 0}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-muted">生徒の担当選択画面での並び順（小さい数字ほど先）</p>
          </label>
          {coach && (
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="isActive" defaultChecked={coach.is_active} />
              予約画面に表示する
            </label>
          )}
        </div>

        <CoachProfileFields coach={coach} />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : coach ? '更新' : '追加'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-muted">
              キャンセル
            </button>
          )}
        </div>
      </form>

      {coach && (
        <form action={deleteCoachingCoach} onSubmit={handleDelete} className="border-t border-border pt-3">
          <input type="hidden" name="id" value={coach.id} />
          <button type="submit" className="text-sm text-error hover:underline">
            この講師を削除
          </button>
        </form>
      )}
    </div>
  )
}

interface AdminCoachingInstructorsManagerProps {
  coaches: CoachingCoach[]
}

export function AdminCoachingInstructorsManager({ coaches }: AdminCoachingInstructorsManagerProps) {
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">担当講師</h2>
      <p className="mt-1 text-sm text-muted">生徒が予約時に選ぶコーチング担当者です。</p>
      <div className="mt-4 space-y-4">
        <CoachForm />
        {coaches.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {coaches.map((coach) => (
              <li key={coach.id} className="p-4">
                {editingCoachId === coach.id ? (
                  <CoachForm
                    coach={coach}
                    onCancel={() => setEditingCoachId(null)}
                    onDeleted={() => setEditingCoachId(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{coach.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        表示順 {coach.sort_order} / {coach.is_active ? '表示中' : '非表示'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCoachId(coach.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      編集
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
