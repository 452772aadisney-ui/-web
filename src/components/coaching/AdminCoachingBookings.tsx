'use client'

import Link from 'next/link'
import {
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCoachingBooking,
  completeCoachingBooking,
  markCoachingBookingNoShow,
} from '@/app/coaching/actions'
import {
  formatCoachingBookingActionTarget,
  formatCoachingBookingDateTime,
} from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import {
  COACHING_BOOKING_STATUS_LABELS,
  type CoachingBookingStatus,
  type CoachingBookingWithDetails,
} from '@/types/coaching'

function coachingStatusLabel(status: string): string {
  return COACHING_BOOKING_STATUS_LABELS[status as CoachingBookingStatus] ?? status
}

const actionButtonClass =
  'rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-background'

function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary">
      {coachingStatusLabel(status)}
    </span>
  )
}

function BookingActionButtons({ booking }: { booking: CoachingBookingWithDetails }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function runAction(
    event: FormEvent<HTMLFormElement>,
    message: string,
    action: (formData: FormData) => Promise<void>,
  ) {
    event.preventDefault()
    if (!window.confirm(message)) return

    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      await action(formData)
      router.refresh()
    })
  }

  const studentName = booking.student ? getPersonName(booking.student) : '生徒'
  const target = formatCoachingBookingActionTarget(
    studentName,
    booking.slot.slot_date,
    booking.slot.start_time,
    booking.slot.starts_at,
  )

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {booking.student && (
        <Link
          href={`/admin/coaching/karte/${booking.student.id}?booking=${booking.id}&coach=${booking.coach_id}`}
          className={`${actionButtonClass} border-primary/30 text-primary`}
          aria-label={`${target}のカルテを開く`}
        >
          カルテ
        </Link>
      )}
      <form
        onSubmit={(event) =>
          runAction(event, `${target}を実施済みにします。`, completeCoachingBooking)
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={pending}
          className={actionButtonClass}
          aria-label={`${target}を実施済みにする`}
        >
          実施済みにする
        </button>
      </form>
      <form
        onSubmit={(event) =>
          runAction(event, `${target}を無断欠席にします。`, markCoachingBookingNoShow)
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={pending}
          className={actionButtonClass}
          aria-label={`${target}を無断欠席にする`}
        >
          無断欠席
        </button>
      </form>
      <form
        onSubmit={(event) =>
          runAction(event, `${target}をキャンセルします。`, cancelCoachingBooking)
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={pending}
          className={`${actionButtonClass} border-red-200 text-error hover:bg-red-50`}
          aria-label={`${target}をキャンセルする`}
        >
          キャンセル
        </button>
      </form>
    </div>
  )
}

function BookingCard({
  booking,
  showPastScheduledHint = false,
  allowEditActions = false,
}: {
  booking: CoachingBookingWithDetails
  showPastScheduledHint?: boolean
  allowEditActions?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const studentName = booking.student ? getPersonName(booking.student) : '生徒'
  const dateTimeLabel = formatCoachingBookingDateTime(
    booking.slot.slot_date,
    booking.slot.start_time,
    booking.slot.starts_at,
    booking.slot.ends_at,
  )
  const canEdit = allowEditActions && booking.status === 'scheduled'
  const editAriaLabel = `${studentName} ${dateTimeLabel}を編集`

  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">
              {studentName}
              <span className="font-medium text-muted"> / {booking.coach.name}</span>
            </p>
            <BookingStatusBadge status={booking.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted">{dateTimeLabel}</p>
          {showPastScheduledHint && booking.status === 'scheduled' && (
            <p className="mt-1.5 text-sm text-amber-800" role="status">
              実施状況を更新してください
            </p>
          )}
          {booking.student_note && (
            <p className="mt-1.5 text-sm text-muted">伝言: {booking.student_note}</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-expanded={editing}
            aria-controls={`booking-actions-${booking.id}`}
            aria-label={editAriaLabel}
          >
            {editing ? '閉じる' : '編集'}
          </button>
        )}
      </div>
      {canEdit && editing && (
        <div id={`booking-actions-${booking.id}`} className="mt-3 border-t border-border pt-3">
          <BookingActionButtons booking={booking} />
        </div>
      )}
    </li>
  )
}

function BookingSection({
  id,
  title,
  bookings,
  emptyMessage,
  allowEditActions = false,
  showPastScheduledHint = false,
  headerExtra,
  footer,
}: {
  id?: string
  title: string
  bookings: CoachingBookingWithDetails[]
  emptyMessage: string
  allowEditActions?: boolean
  showPastScheduledHint?: boolean
  headerExtra?: ReactNode
  footer?: ReactNode
}) {
  return (
    <section id={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {headerExtra}
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              allowEditActions={allowEditActions}
              showPastScheduledHint={showPastScheduledHint}
            />
          ))}
        </ul>
      )}
      {footer}
    </section>
  )
}

interface AdminCoachingBookingsProps {
  todayBookings: CoachingBookingWithDetails[]
  futureBookings: CoachingBookingWithDetails[]
  pastBookings: CoachingBookingWithDetails[]
  pastTotalCount: number
  pastRangeLabel: string | null
  pastSearchForm: ReactNode
  pastPagination: ReactNode
}

export function AdminCoachingBookings({
  todayBookings,
  futureBookings,
  pastBookings,
  pastTotalCount,
  pastRangeLabel,
  pastSearchForm,
  pastPagination,
}: AdminCoachingBookingsProps) {
  return (
    <div className="space-y-10">
      <BookingSection
        title="今日の予約"
        bookings={todayBookings}
        emptyMessage="今日の予約はありません。"
        allowEditActions
      />
      <BookingSection
        title="今後（明日以降）の予約"
        bookings={futureBookings}
        emptyMessage="明日以降の予約はありません。"
        allowEditActions
      />

      <section
        id="past-coaching-bookings"
        className="space-y-3 border-t border-border pt-8"
      >
        <h2 className="text-lg font-bold">過去の予約</h2>
        {pastSearchForm}
        <p className="text-sm text-muted">
          {pastTotalCount === 0
            ? '全0件'
            : pastRangeLabel
              ? `全${pastTotalCount}件／${pastRangeLabel}`
              : `全${pastTotalCount}件`}
        </p>
        {pastBookings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted">
            {pastTotalCount === 0
              ? '該当する過去の予約はありません。'
              : 'このページに表示する予約はありません。'}
          </p>
        ) : (
          <ul className="space-y-2">
            {pastBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                allowEditActions
                showPastScheduledHint
              />
            ))}
          </ul>
        )}
        {pastPagination}
      </section>
    </div>
  )
}
