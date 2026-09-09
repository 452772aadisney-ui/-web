'use client'

import { useActionState, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminRescheduleCoachingBooking,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import { useActionToast } from '@/hooks/useActionToast'
import { getWeekStartMonday } from '@/lib/coaching/week'
import type { AvailableCoachingSlot, CoachingBookingWithDetails, CoachingCoach } from '@/types/coaching'

const initialState: CoachingActionState = {}

interface AdminCoachingRescheduleModalProps {
  booking: CoachingBookingWithDetails
  coaches: CoachingCoach[]
  weekStart: string
  onClose: () => void
}

export function AdminCoachingRescheduleModal({
  booking,
  coaches,
  weekStart: initialWeekStart,
  onClose,
}: AdminCoachingRescheduleModalProps) {
  const router = useRouter()
  const [selectedCoachId, setSelectedCoachId] = useState(booking.coach_id)
  const [selectedSlot, setSelectedSlot] = useState<AvailableCoachingSlot | null>(null)
  const [weekStart] = useState(() => getWeekStartMonday(initialWeekStart))
  const [state, formAction, pending] = useActionState(
    adminRescheduleCoachingBooking,
    initialState,
  )

  useActionToast(state, {
    successMessage: '予約を変更しました',
    pending,
  })

  useEffect(() => {
    if (state.success) {
      onClose()
      router.refresh()
    }
  }, [state.success, onClose, router])

  const studentName = booking.student ? getPersonName(booking.student) : '生徒'
  const currentLabel = formatCoachingBookingDateTime(
    booking.slot.slot_date,
    booking.slot.start_time,
    booking.slot.starts_at,
    booking.slot.ends_at,
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSlot || pending) return

    const nextLabel = formatCoachingBookingDateTime(
      selectedSlot.slot_date,
      selectedSlot.start_time,
      selectedSlot.starts_at,
      selectedSlot.ends_at,
    )

    if (
      !window.confirm(
        `予約を変更します。\n\n生徒: ${studentName}\n現在: ${currentLabel}（${booking.coach.name}）\n変更後: ${nextLabel}（${selectedSlot.coach.name}）\n\nよろしいですか？`,
      )
    ) {
      return
    }

    formAction(new FormData(event.currentTarget))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`reschedule-title-${booking.id}`}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`reschedule-title-${booking.id}`} className="text-lg font-bold">
              予約変更
            </h2>
            <p className="mt-1 text-sm text-muted">
              {studentName} / 現在: {currentLabel}（{booking.coach.name}）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-60"
          >
            閉じる
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">1. 担当を選ぶ</p>
            <div className="flex flex-wrap gap-2">
              {coaches.map((coach) => (
                <button
                  key={coach.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setSelectedCoachId(coach.id)
                    setSelectedSlot(null)
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                    selectedCoachId === coach.id
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  {coach.name}
                </button>
              ))}
            </div>
          </div>

          {selectedCoachId && (
            <div>
              <p className="mb-2 text-sm font-medium">2. 日時を選ぶ</p>
              <CoachingWeekGrid
                mode="proxy"
                coachId={selectedCoachId}
                weekStart={weekStart}
                availableSlots={[]}
                selectedSlotId={selectedSlot?.id ?? null}
                onSelectSlot={setSelectedSlot}
                onNavigate={() => setSelectedSlot(null)}
              />
            </div>
          )}

          {selectedSlot && (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="slotId" value={selectedSlot.id} />
              <p className="text-sm font-medium">
                変更後: {selectedSlot.coach.name} /{' '}
                {formatCoachingBookingDateTime(
                  selectedSlot.slot_date,
                  selectedSlot.start_time,
                  selectedSlot.starts_at,
                  selectedSlot.ends_at,
                )}
              </p>
              {state.error && (
                <p className="text-sm text-error" role="alert">
                  {state.error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
                >
                  {pending ? '変更中…' : 'この内容で変更する'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="text-sm text-muted hover:text-foreground disabled:opacity-60"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
