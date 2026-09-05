'use client'

import Link from 'next/link'
import { useTransition, type FormEvent } from 'react'
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
import { getJstDateKey } from '@/lib/study/dates'
import {
  COACHING_BOOKING_STATUS_LABELS,
  type CoachingBookingStatus,
  type CoachingBookingWithDetails,
} from '@/types/coaching'

interface AdminCoachingBookingsProps {
  bookings: CoachingBookingWithDetails[]
}

function getBookingDateKey(booking: CoachingBookingWithDetails): string {
  return booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10)
}

function sortByStartAsc(a: CoachingBookingWithDetails, b: CoachingBookingWithDetails): number {
  return a.slot.starts_at.localeCompare(b.slot.starts_at)
}

function coachingStatusLabel(status: string): string {
  return (
    COACHING_BOOKING_STATUS_LABELS[status as CoachingBookingStatus] ?? status
  )
}

const actionButtonClass =
  'rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-background'

function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary">
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

function BookingListItem({
  booking,
  showActions = false,
  showPastScheduledHint = false,
}: {
  booking: CoachingBookingWithDetails
  showActions?: boolean
  showPastScheduledHint?: boolean
}) {
  return (
    <li className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {booking.student ? getPersonName(booking.student) : '生徒'}
              {' / '}
              {booking.coach.name}
            </p>
            <BookingStatusBadge status={booking.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatCoachingBookingDateTime(
              booking.slot.slot_date,
              booking.slot.start_time,
              booking.slot.starts_at,
              booking.slot.ends_at,
            )}
          </p>
          {showPastScheduledHint && booking.status === 'scheduled' && (
            <p className="mt-2 text-sm text-amber-800" role="status">
              実施状況を更新してください
            </p>
          )}
          {booking.student_note && <p className="mt-2 text-sm">伝言: {booking.student_note}</p>}
        </div>
        {showActions && booking.status === 'scheduled' && (
          <BookingActionButtons booking={booking} />
        )}
      </div>
    </li>
  )
}

function BookingSection({
  title,
  bookings,
  emptyMessage,
  showActions = false,
  showPastScheduledHint = false,
}: {
  title: string
  bookings: CoachingBookingWithDetails[]
  emptyMessage: string
  showActions?: boolean
  showPastScheduledHint?: boolean
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {bookings.map((booking) => (
            <BookingListItem
              key={booking.id}
              booking={booking}
              showActions={showActions}
              showPastScheduledHint={showPastScheduledHint}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function AdminCoachingBookings({ bookings }: AdminCoachingBookingsProps) {
  const todayKey = getJstDateKey()
  const scheduledBookings = bookings
    .filter((booking) => booking.status === 'scheduled')
    .sort(sortByStartAsc)

  const todayBookings = scheduledBookings.filter(
    (booking) => getBookingDateKey(booking) === todayKey,
  )
  const futureBookings = scheduledBookings.filter(
    (booking) => getBookingDateKey(booking) > todayKey,
  )
  const pastBookings = bookings
    .filter((booking) => booking.status !== 'cancelled' && getBookingDateKey(booking) < todayKey)
    .sort((a, b) => b.slot.starts_at.localeCompare(a.slot.starts_at))

  return (
    <div className="space-y-8">
      <BookingSection
        title="今日の予約"
        bookings={todayBookings}
        emptyMessage="今日の予約はありません。"
        showActions
      />
      <BookingSection
        title="今後（明日以降）の予約"
        bookings={futureBookings}
        emptyMessage="明日以降の予約はありません。"
        showActions
      />

      {pastBookings.length > 0 && (
        <BookingSection
          title="過去の予約"
          bookings={pastBookings.slice(0, 20)}
          emptyMessage="過去の予約はありません。"
          showActions
          showPastScheduledHint
        />
      )}
    </div>
  )
}
