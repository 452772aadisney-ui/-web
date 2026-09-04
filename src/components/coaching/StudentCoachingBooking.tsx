'use client'

import { useActionState, useEffect, useState, type FormEvent, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  bookCoachingSlot,
  cancelCoachingBooking,
  rescheduleCoachingBooking,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import { CoachProfileDisplay } from '@/components/coaching/CoachProfileDisplay'
import { useActionToast } from '@/hooks/useActionToast'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
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
  windowStart: string
  availableSlots: AvailableCoachingSlot[]
  bookings: CoachingBookingWithDetails[]
}

function formatBookingConfirmLabel(slot: {
  coach: { name: string }
  slot_date: string | null | undefined
  start_time: string | null | undefined
  starts_at: string
  ends_at: string
}): string {
  const datetime = formatCoachingBookingDateTime(
    slot.slot_date,
    slot.start_time,
    slot.starts_at,
    slot.ends_at,
  )
  return `${datetime} 担当：${slot.coach.name}`
}

function bookingSlotMeta(booking: CoachingBookingWithDetails) {
  return {
    coach: booking.coach,
    slot_date: booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10),
    start_time: booking.slot.start_time,
    starts_at: booking.slot.starts_at,
    ends_at: booking.slot.ends_at,
  }
}

function BookingForm({
  slot,
  onCancel,
}: {
  slot: AvailableCoachingSlot
  onCancel: () => void
}) {
  const [state, formAction, pending] = useActionState(bookCoachingSlot, initialState)
  const { dialog: achievementDialog } = useAchievementUnlockDialog(state.unlockedAchievements)
  const confirmLabel = formatBookingConfirmLabel(slot)

  useActionToast(state, {
    successMessage: 'コーチングを予約しました',
    pending,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(`${confirmLabel} で予約をします。よろしいですか？`)) {
      return
    }
    formAction(new FormData(event.currentTarget))
  }

  return (
    <>
      {achievementDialog}
      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-blue-50/40 p-4"
      >
        <input type="hidden" name="slotId" value={slot.id} />
      <p className="text-sm font-medium">
        {slot.coach.name} /{' '}
        {formatCoachingBookingDateTime(
          slot.slot_date,
          slot.start_time,
          slot.starts_at,
          slot.ends_at,
        )}
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
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? '予約中…' : 'この枠で予約する'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted">
          戻る
        </button>
      </div>
    </form>
    </>
  )
}

function RescheduleBookingForm({
  booking,
  slot,
  onCancel,
}: {
  booking: CoachingBookingWithDetails
  slot: AvailableCoachingSlot
  onCancel: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(rescheduleCoachingBooking, initialState)
  const newLabel = formatBookingConfirmLabel(slot)
  const currentLabel = formatBookingConfirmLabel(bookingSlotMeta(booking))

  useActionToast(state, {
    successMessage: '予約を変更しました',
    pending,
  })

  useEffect(() => {
    if (state.success) {
      onCancel()
      router.refresh()
    }
  }, [state.success, onCancel, router])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !window.confirm(
        `予約を変更します。\n\n現在: ${currentLabel}\n変更後: ${newLabel}\n\nよろしいですか？`,
      )
    ) {
      return
    }
    formAction(new FormData(event.currentTarget))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-blue-50/40 p-4"
    >
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="slotId" value={slot.id} />
      <p className="text-sm font-medium">
        変更後: {slot.coach.name} /{' '}
        {formatCoachingBookingDateTime(
          slot.slot_date,
          slot.start_time,
          slot.starts_at,
          slot.ends_at,
        )}
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">伝えておきたいこと（任意）</span>
        <textarea
          name="studentNote"
          rows={3}
          defaultValue={booking.student_note}
          placeholder="例: 志望校の相談、数学の苦手分野など"
          className={fieldClass}
        />
      </label>
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? '変更中…' : '予約を変更する'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted">
          戻る
        </button>
      </div>
    </form>
  )
}

function CancelBookingForm({
  booking,
  confirmLabel,
  onSuccess,
}: {
  booking: CoachingBookingWithDetails
  confirmLabel: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm(`${confirmLabel} の予約をキャンセルします。よろしいですか？`)) {
      return
    }

    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      await cancelCoachingBooking(formData)
      onSuccess?.()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="bookingId" value={booking.id} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg border border-error/30 px-4 py-2 text-sm text-error hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? 'キャンセル中…' : 'キャンセル'}
      </button>
    </form>
  )
}

export function StudentCoachingBooking({
  coaches,
  selectedCoachId: initialSelectedCoachId,
  windowStart,
  availableSlots,
  bookings,
}: StudentCoachingBookingProps) {
  const [selectedCoachId, setSelectedCoachId] = useState(initialSelectedCoachId)
  const [selectedSlot, setSelectedSlot] = useState<AvailableCoachingSlot | null>(null)
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string | null>(null)
  const [rescheduleCoachId, setRescheduleCoachId] = useState<string | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState<AvailableCoachingSlot | null>(null)
  const [rescheduleWindowStart, setRescheduleWindowStart] = useState(windowStart)

  useEffect(() => {
    setSelectedCoachId(initialSelectedCoachId)
  }, [initialSelectedCoachId])

  useEffect(() => {
    setRescheduleWindowStart(windowStart)
  }, [windowStart])

  const upcomingBookings = bookings.filter(
    (b) => b.status === 'scheduled' && new Date(b.slot.starts_at) > new Date(),
  )
  const pastBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && new Date(b.slot.starts_at) <= new Date(),
  )

  function startReschedule(booking: CoachingBookingWithDetails) {
    setRescheduleBookingId(booking.id)
    setRescheduleCoachId(booking.coach_id)
    setRescheduleSlot(null)
    setRescheduleWindowStart(windowStart)
    setSelectedSlot(null)
  }

  function cancelReschedule() {
    setRescheduleBookingId(null)
    setRescheduleCoachId(null)
    setRescheduleSlot(null)
  }

  const isRescheduling = rescheduleBookingId !== null
  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId) ?? null

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">予約済みのコーチング</h2>
        {upcomingBookings.length === 0 ? (
          <p className="mt-4 text-sm text-muted">今後の予約はありません。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {upcomingBookings.map((booking) => {
              const isEditing = rescheduleBookingId === booking.id
              const confirmLabel = formatBookingConfirmLabel(bookingSlotMeta(booking))

              return (
                <li key={booking.id} className="rounded-xl border border-border p-4">
                  <p className="text-center text-lg font-bold">
                    {formatCoachingBookingDateTime(
                      booking.slot.slot_date,
                      booking.slot.start_time,
                      booking.slot.starts_at,
                      booking.slot.ends_at,
                    )}
                  </p>
                  <p className="mt-1 text-center text-sm text-muted">{booking.coach.name}</p>
                  {booking.student_note && (
                    <p className="mt-3 text-sm text-muted">伝言: {booking.student_note}</p>
                  )}

                  {!isEditing ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-medium">予約の変更</p>
                      <div className="flex flex-wrap gap-2">
                        <CancelBookingForm
                          booking={booking}
                          confirmLabel={confirmLabel}
                          onSuccess={cancelReschedule}
                        />
                        <button
                          type="button"
                          onClick={() => startReschedule(booking)}
                          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background"
                        >
                          日時変更
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <p className="text-sm font-medium">新しい日時を選ぶ</p>
                      <div className="flex flex-wrap gap-2">
                        {coaches.map((coach) => (
                          <button
                            key={coach.id}
                            type="button"
                            onClick={() => {
                              setRescheduleCoachId(coach.id)
                              setRescheduleSlot(null)
                            }}
                            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                              rescheduleCoachId === coach.id
                                ? 'border-primary bg-blue-50 text-primary'
                                : 'border-border hover:bg-background'
                            }`}
                          >
                            {coach.name}
                          </button>
                        ))}
                      </div>

                      {rescheduleCoachId && (
                        <>
                          <CoachingWeekGrid
                            mode="student"
                            coachId={rescheduleCoachId}
                            windowStart={rescheduleWindowStart}
                            availableSlots={
                              rescheduleCoachId === initialSelectedCoachId ? availableSlots : []
                            }
                            selectedSlotId={rescheduleSlot?.id ?? null}
                            onSelectSlot={setRescheduleSlot}
                            onNavigate={() => setRescheduleSlot(null)}
                          />
                          {rescheduleSlot && (
                            <RescheduleBookingForm
                              booking={booking}
                              slot={rescheduleSlot}
                              onCancel={cancelReschedule}
                            />
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={cancelReschedule}
                        className="text-sm text-muted hover:text-foreground"
                      >
                        変更をやめる
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {!isRescheduling && (
        <>
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">1. 担当を選ぶ</h2>
            <p className="mt-1 text-sm text-muted">
              コーチング担当者を選ぶと、予約可能な枠が表示されます。
            </p>

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
                      setSelectedSlot(null)
                    }}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                      selectedCoachId === coach.id
                        ? 'border-primary bg-blue-50 text-primary'
                        : 'border-border hover:bg-background'
                    }`}
                  >
                    {coach.name}
                  </button>
                ))}
              </div>
            )}
            {selectedCoach && <CoachProfileDisplay coach={selectedCoach} />}
          </section>

          {selectedCoachId && (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-bold">2. 日時を選ぶ</h2>
              <p className="mt-1 text-sm text-muted">4日分の予約枠を表示しています。</p>

              <div className="mt-4">
                <CoachingWeekGrid
                  mode="student"
                  coachId={selectedCoachId}
                  windowStart={windowStart}
                  availableSlots={
                    selectedCoachId === initialSelectedCoachId ? availableSlots : []
                  }
                  selectedSlotId={selectedSlot?.id ?? null}
                  onSelectSlot={setSelectedSlot}
                  onNavigate={() => setSelectedSlot(null)}
                />
              </div>

              {selectedSlot && (
                <BookingForm slot={selectedSlot} onCancel={() => setSelectedSlot(null)} />
              )}
            </section>
          )}
        </>
      )}

      {pastBookings.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">過去のコーチング</h2>
          <ul className="mt-4 space-y-3">
            {pastBookings.slice(0, 5).map((booking) => (
              <li key={booking.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{booking.coach.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatCoachingBookingDateTime(
                    booking.slot.slot_date,
                    booking.slot.start_time,
                    booking.slot.starts_at,
                    booking.slot.ends_at,
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
