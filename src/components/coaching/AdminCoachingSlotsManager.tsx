'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  createCoachingCoach,
  deleteCoachingCoach,
  updateCoachingCoach,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import type { CoachingCoach } from '@/types/coaching'
import type { CoachingGridSlot } from '@/lib/coaching/queries'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function CoachForm({
  coach,
  onCancel,
}: {
  coach?: CoachingCoach
  onCancel?: () => void
}) {
  const action = coach ? updateCoachingCoach : createCoachingCoach
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
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
      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">保存しました</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? '保存中…' : coach ? '更新' : '追加'}
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

interface AdminCoachingSlotsManagerProps {
  coaches: CoachingCoach[]
  selectedCoachId: string | null
  weekStart: string
  gridSlots: CoachingGridSlot[]
}

export function AdminCoachingSlotsManager({
  coaches,
  selectedCoachId,
  weekStart,
  gridSlots,
}: AdminCoachingSlotsManagerProps) {
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)
  const activeCoaches = coaches.filter((c) => c.is_active)

  return (
    <div className="space-y-8">
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
                    <CoachForm coach={coach} onCancel={() => setEditingCoachId(null)} />
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{coach.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          表示順 {coach.sort_order} / {coach.is_active ? '表示中' : '非表示'}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Link
                          href={`/admin/coaching?coach=${coach.id}&week=${weekStart}`}
                          className="text-xs text-primary hover:underline"
                        >
                          枠を編集
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditingCoachId(coach.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          編集
                        </button>
                        <form action={deleteCoachingCoach}>
                          <input type="hidden" name="id" value={coach.id} />
                          <button type="submit" className="text-xs text-error hover:underline">
                            削除
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">予約枠の開放</h2>
        <p className="mt-1 text-sm text-muted">
          10:00〜21:00（30分刻み）の枠から、開放する時間帯を選びます。
        </p>

        {activeCoaches.length === 0 ? (
          <p className="mt-4 text-sm text-muted">先に担当講師を登録してください。</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeCoaches.map((coach) => (
                <Link
                  key={coach.id}
                  href={`/admin/coaching?coach=${coach.id}&week=${weekStart}`}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    selectedCoachId === coach.id
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  {coach.name}
                </Link>
              ))}
            </div>

            {selectedCoachId && (
              <div className="mt-6">
                <CoachingWeekGrid
                  mode="admin"
                  coachId={selectedCoachId}
                  weekStart={weekStart}
                  gridSlots={gridSlots}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
