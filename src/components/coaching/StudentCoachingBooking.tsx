'use client'

import { useActionState, useMemo, useState } from 'react'
import { bookCoachingSlot, cancelCoachingBooking, type CoachingActionState } from '@/app/coaching/actions'
import {
  formatCoachingDateKey,
  formatCoachingDateLabel,
  formatCoachingDateTimeRange,
} from '@/lib/coaching/format'
import type {
  AvailableCoachingSlot,
  CoachingBookingWithDetails,
  CoachingCoach,
} from '@/types/coaching'
import { cn } from '@/lib/utils'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface StudentCoachingBookingProps {
  coaches: CoachingCoach[]
  availableSlots: AvailableCoachingSlot[]
  bookings: CoachingBookingWithDetails[]
}

function groupSlotsByDate(slots: AvailableCoachingSlot[]) {
  const map = new Map<string, AvailableCoachingSlot[]>()
  for (const slot of slots) {
    const key = formatCoachingDateKey(slot.starts_at)
    const list = map.get(key) ?? []
    list.push(slot)
    map.set(key, list)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

function BookingForm({
  slot,
  onCancel,
}: {
  slot: AvailableCoachingSlot
  onCancel: () => void
}) {
  const [state, formAction, pending] = useActionState(bookCoachingSlot, initialState)

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-blue-50/40 p-4">
      <input type="hidden" name="slotId" value={slot.id} />
      <p className="text-sm font-medium">
        {slot.coach.name} / {formatCoachingDateTimeRange(slot.starts_at, slot.ends_at)}
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">伝えておきたいこと（任意）</span>
        <textarea
          name="studentNote"
          rows={3}
          placeholder="例: 志望校の相談、数学の苦手分野など"
          className={fieldClass}
        />
      </label>
      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">予約しました</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? '予約中…' : 'この枠で予約する'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted">
          戻る
        </button>
      </div>
    </form>
  )
}

export function StudentCoachingBooking({
  coaches,
  availableSlots,
  bookings,
}: StudentCoachingBookingProps) {
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(
    coaches.length === 1 ? coaches[0]?.id ?? null : null,
  )
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  const coachSlots = useMemo(
    () => availableSlots.filter((slot) => slot.coach_id === selectedCoachId),
    [availableSlots, selectedCoachId],
  )
  const groupedSlots = useMemo(() => groupSlotsByDate(coachSlots), [coachSlots])
  const selectedSlot = availableSlots.find((slot) => slot.id === selectedSlotId) ?? null

  const upcomingBookings = bookings.filter(
    (b) => b.status === 'scheduled' && new Date(b.slot.starts_at) > new Date(),
  )
  const pastBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && new Date(b.slot.starts_at) <= new Date(),
  )

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">1. 担当を選ぶ</h2>
        <p className="mt-1 text-sm text-muted">コーチング担当者を選ぶと、予約可能な枠が表示されます。</p>

        {coaches.length === 0 ? (
          <p className="mt-4 text-sm text-muted">現在、予約可能な担当者がいません。</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {coaches.map((coach) => (
              <button
                key={coach.id}
                type="button"
                onClick={() => {
                  setSelectedCoachId(coach.id)
                  setSelectedSlotId(null)
                }}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-medium transition',
                  selectedCoachId === coach.id
                    ? 'border-primary bg-blue-50 text-primary'
                    : 'border-border hover:bg-background',
                )}
              >
                {coach.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCoachId && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">2. 日時を選ぶ</h2>
          <p className="mt-1 text-sm text-muted">空いている枠を選んで予約してください。</p>

          {groupedSlots.length === 0 ? (
            <p className="mt-4 text-sm text-muted">この担当の予約可能枠はまだありません。</p>
          ) : (
            <div className="mt-4 space-y-4">
              {groupedSlots.map(([dateKey, slots]) => (
                <div key={dateKey}>
                  <p className="mb-2 text-sm font-medium text-muted">{formatCoachingDateLabel(dateKey)}</p>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm transition',
                          selectedSlotId === slot.id
                            ? 'border-primary bg-primary text-white'
                            : 'border-border hover:bg-background',
                        )}
                      >
                        {new Date(slot.starts_at).toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        〜
                        {new Date(slot.ends_at).toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSlot && (
            <BookingForm slot={selectedSlot} onCancel={() => setSelectedSlotId(null)} />
          )}
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">予約済み</h2>
        {upcomingBookings.length === 0 ? (
          <p className="mt-4 text-sm text-muted">今後の予約はありません。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcomingBookings.map((booking) => (
              <li key={booking.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{booking.coach.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatCoachingDateTimeRange(booking.slot.starts_at, booking.slot.ends_at)}
                </p>
                {booking.student_note && (
                  <p className="mt-2 text-sm">伝言: {booking.student_note}</p>
                )}
                <form action={cancelCoachingBooking} className="mt-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button type="submit" className="text-xs text-error hover:underline">
                    キャンセル
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastBookings.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">過去のコーチング</h2>
          <ul className="mt-4 space-y-3">
            {pastBookings.slice(0, 5).map((booking) => (
              <li key={booking.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{booking.coach.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatCoachingDateTimeRange(booking.slot.starts_at, booking.slot.ends_at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
