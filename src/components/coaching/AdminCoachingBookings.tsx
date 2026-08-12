'use client'

import {
  cancelCoachingBooking,
  completeCoachingBooking,
} from '@/app/coaching/actions'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import type { CoachingBookingWithDetails } from '@/types/coaching'

interface AdminCoachingBookingsProps {
  bookings: CoachingBookingWithDetails[]
}

export function AdminCoachingBookings({ bookings }: AdminCoachingBookingsProps) {
  const upcomingBookings = bookings.filter(
    (b) => b.status === 'scheduled' && new Date(b.slot.starts_at) >= new Date(),
  )
  const pastBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && new Date(b.slot.starts_at) < new Date(),
  )

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">今後の予約</h2>
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
                      {formatCoachingBookingDateTime(
                        booking.slot.slot_date,
                        booking.slot.start_time,
                        booking.slot.starts_at,
                        booking.slot.ends_at,
                      )}
                    </p>
                    {booking.student_note && (
                      <p className="mt-2 text-sm">伝言: {booking.student_note}</p>
                    )}
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

      {pastBookings.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">過去の予約</h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {pastBookings.slice(0, 20).map((booking) => (
              <li key={booking.id} className="p-4">
                <p className="font-medium">
                  {booking.student ? getPersonName(booking.student) : '生徒'}
                  {' / '}
                  {booking.coach.name}
                  {' / '}
                  <span className="text-sm font-normal text-muted">
                    {booking.status === 'completed' ? '完了' : booking.status}
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
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
