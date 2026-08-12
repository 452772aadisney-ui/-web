'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { bookCoachingSlot, cancelCoachingBooking, type CoachingActionState } from '@/app/coaching/actions'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import { formatCoachingDateTimeRange } from '@/lib/coaching/format'
import type {
  AvailableCoachingSlot,
  CoachingBookingWithDetails,
  CoachingCoach,
} from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface StudentCoachingBookingProps {
  coaches: CoachingCoach[]
  selectedCoachId: string | null
  weekStart: string
  availableSlots: AvailableCoachingSlot[]
  bookings: CoachingBookingWithDetails[]
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
  selectedCoachId,
  weekStart,
  availableSlots,
  bookings,
}: StudentCoachingBookingProps) {
  const [selectedSlot, setSelectedSlot] = useState<AvailableCoachingSlot | null>(null)

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
              <Link
                key={coach.id}
                href={`/dashboard/coaching?coach=${coach.id}&week=${weekStart}`}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  selectedCoachId === coach.id
                    ? 'border-primary bg-blue-50 text-primary'
                    : 'border-border hover:bg-background'
                }`}
              >
                {coach.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {selectedCoachId && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">2. 日時を選ぶ</h2>
          <p className="mt-1 text-sm text-muted">開放されている枠のみ表示されます。</p>

          <div className="mt-4">
            <CoachingWeekGrid
              mode="student"
              coachId={selectedCoachId}
              weekStart={weekStart}
              gridSlots={[]}
              availableSlots={availableSlots}
              selectedSlotId={selectedSlot?.id ?? null}
              onSelectSlot={setSelectedSlot}
            />
          </div>

          {availableSlots.length === 0 && (
            <p className="mt-4 text-sm text-muted">この週に予約可能な枠はありません。</p>
          )}

          {selectedSlot && (
            <BookingForm slot={selectedSlot} onCancel={() => setSelectedSlot(null)} />
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
