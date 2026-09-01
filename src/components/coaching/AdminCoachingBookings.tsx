'use client'

import Link from 'next/link'
import { useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelCoachingBooking,
  completeCoachingBooking,
  markCoachingBookingNoShow,
} from '@/app/coaching/actions'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import { getJstDateKey } from '@/lib/study/dates'
import {
  COACHING_BOOKING_STATUS_LABELS,
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

const actionButtonClass =
  'rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-background'

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

  const datetime = formatCoachingBookingDateTime(
    booking.slot.slot_date,
    booking.slot.start_time,
    booking.slot.starts_at,
    booking.slot.ends_at,
  )
  const studentName = booking.student ? getPersonName(booking.student) : '生徒'

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {booking.student && (
        <Link
          href={`/admin/coaching/karte/${booking.student.id}?booking=${booking.id}&coach=${booking.coach_id}`}
          className={`${actionButtonClass} border-primary/30 text-primary`}
        >
          カルテ
        </Link>
      )}
      <form
        onSubmit={(event) =>
          runAction(event, `${studentName} さんの ${datetime} の予約を完了にします。`, completeCoachingBooking)
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button type="submit" disabled={pending} className={actionButtonClass}>
          完了にする
        </button>
      </form>
      <form
        onSubmit={(event) =>
          runAction(event, `${studentName} さんの ${datetime} の予約を未実施にします。`, markCoachingBookingNoShow)
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button type="submit" disabled={pending} className={actionButtonClass}>
          未実施
        </button>
      </form>
      <form
        onSubmit={(event) =>
          runAction(
            event,
            `${studentName} さんの ${datetime} の予約をキャンセルします。`,
            cancelCoachingBooking,
          )
        }
      >
        <input type="hidden" name="bookingId" value={booking.id} />
        <button
          type="submit"
          disabled={pending}
          className={`${actionButtonClass} border-red-200 text-error hover:bg-red-50`}
        >
          キャンセル
        </button>
      </form>
    </div>
  )
}

function BookingListItem({ booking }: { booking: CoachingBookingWithDetails }) {
  return (
    <li className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-medium">
            {booking.student ? getPersonName(booking.student) : '生徒'}
            {' / '}
            {booking.coach.name}
          </p>
          <p className="mt-1 text-sm text-muted">
            {formatCoachingBookingDateTime(
              booking.slot.slot_date,
              booking.slot.start_time,
              booking.slot.starts_at,
              booking.slot.ends_at,
            )}
          </p>
          {booking.student_note && <p className="mt-2 text-sm">伝言: {booking.student_note}</p>}
        </div>
        <BookingActionButtons booking={booking} />
      </div>
    </li>
  )
}

function BookingSection({
  title,
  bookings,
  emptyMessage,
}: {
  title: string
  bookings: CoachingBookingWithDetails[]
  emptyMessage: string
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {bookings.map((booking) => (
            <BookingListItem key={booking.id} booking={booking} />
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
      />
      <BookingSection
        title="今後（明日以降）の予約"
        bookings={futureBookings}
        emptyMessage="明日以降の予約はありません。"
      />

      {pastBookings.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">過去の予約</h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {pastBookings.slice(0, 20).map((booking) =>
              booking.status === 'scheduled' ? (
                <BookingListItem key={booking.id} booking={booking} />
              ) : (
                <li key={booking.id} className="p-4">
                  <p className="font-medium">
                    {booking.student ? getPersonName(booking.student) : '生徒'}
                    {' / '}
                    {booking.coach.name}
                    {' / '}
                    <span className="text-sm font-normal text-muted">
                      {COACHING_BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatCoachingBookingDateTime(
                      booking.slot.slot_date,
                      booking.slot.start_time,
                      booking.slot.starts_at,
                      booking.slot.ends_at,
                    )}
                  </p>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
