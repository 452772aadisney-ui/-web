'use client'

import { useActionState, useState } from 'react'
import {
  cancelCoachingBooking,
  completeCoachingBooking,
  createCoachingCoach,
  createCoachingSlot,
  deleteCoachingCoach,
  deleteCoachingSlot,
  updateCoachingCoach,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { getPersonName } from '@/lib/auth/display-name'
import { formatCoachingDateTimeRange } from '@/lib/coaching/format'
import type {
  CoachingBookingWithDetails,
  CoachingCoach,
} from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

type AdminSlot = {
  id: string
  coach_id: string
  starts_at: string
  ends_at: string
  created_at: string
  coach: { id: string; name: string }
  is_booked: boolean
}

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

interface AdminCoachingManagerProps {
  coaches: CoachingCoach[]
  slots: AdminSlot[]
  bookings: CoachingBookingWithDetails[]
}

export function AdminCoachingManager({ coaches, slots, bookings }: AdminCoachingManagerProps) {
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)
  const [slotState, slotAction, slotPending] = useActionState(createCoachingSlot, initialState)

  const activeCoaches = coaches.filter((c) => c.is_active)
  const upcomingSlots = slots.filter((s) => new Date(s.starts_at) >= new Date())
  const upcomingBookings = bookings.filter(
    (b) => b.status === 'scheduled' && new Date(b.slot.starts_at) >= new Date(),
  )

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
        <h2 className="text-lg font-bold">予約枠の追加</h2>
        <p className="mt-1 text-sm text-muted">講師ごとに、生徒が選べる空き枠を登録します。</p>
        <form action={slotAction} className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">担当講師 *</span>
              <select name="coachId" required className={fieldClass} defaultValue="">
                <option value="" disabled>
                  選択してください
                </option>
                {activeCoaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">日付 *</span>
              <input type="date" name="slotDate" required className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">開始時刻 *</span>
              <input type="time" name="startTime" required className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">終了時刻 *</span>
              <input type="time" name="endTime" required className={fieldClass} />
            </label>
          </div>
          {slotState.error && <p className="text-sm text-error">{slotState.error}</p>}
          {slotState.success && <p className="text-sm text-green-700">予約枠を追加しました</p>}
          <button
            type="submit"
            disabled={slotPending || activeCoaches.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {slotPending ? '追加中…' : '枠を追加'}
          </button>
        </form>

        {upcomingSlots.length > 0 && (
          <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
            {upcomingSlots.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{slot.coach.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatCoachingDateTimeRange(slot.starts_at, slot.ends_at)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {slot.is_booked ? '予約済み' : '空き'}
                  </p>
                </div>
                {!slot.is_booked && (
                  <form action={deleteCoachingSlot}>
                    <input type="hidden" name="id" value={slot.id} />
                    <button type="submit" className="text-xs text-error hover:underline">
                      削除
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">予約一覧</h2>
        {upcomingBookings.length === 0 ? (
          <p className="mt-4 text-sm text-muted">今後の予約はありません。</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {upcomingBookings.map((booking) => (
              <li key={booking.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {booking.student ? getPersonName(booking.student) : '生徒'}
                      {' / '}
                      {booking.coach.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatCoachingDateTimeRange(booking.slot.starts_at, booking.slot.ends_at)}
                    </p>
                    {booking.student_note && (
                      <p className="mt-2 text-sm">伝言: {booking.student_note}</p>
                    )}
                    <p className="mt-1 text-xs text-muted">状態: {booking.status}</p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <form action={completeCoachingBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className="text-xs text-primary hover:underline">
                        完了にする
                      </button>
                    </form>
                    <form action={cancelCoachingBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className="text-xs text-error hover:underline">
                        キャンセル
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
