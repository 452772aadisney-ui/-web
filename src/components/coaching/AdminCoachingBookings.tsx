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
import { AdminCoachingRescheduleModal } from '@/components/coaching/AdminCoachingRescheduleModal'
import {
  formatCoachingBookingActionTarget,
  formatCoachingDateLabel,
} from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import { groupCoachingBookingsByDate } from '@/lib/coaching/admin-bookings-list'
import {
  addMinutesToTime,
  COACHING_SLOT_DURATION_MINUTES,
  normalizeStartTime,
} from '@/lib/coaching/slot-times'
import {
  COACHING_BOOKING_STATUS_LABELS,
  type CoachingBookingStatus,
  type CoachingBookingWithDetails,
  type CoachingCoach,
} from '@/types/coaching'

function coachingStatusLabel(status: string): string {
  return COACHING_BOOKING_STATUS_LABELS[status as CoachingBookingStatus] ?? status
}

const actionButtonBaseClass =
  'rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60'

/** Shared with legacy カルテ / 実施済み accent (primary blue). */
const actionBlueClass = 'border-primary/30 bg-blue-50 text-primary hover:bg-blue-100'

/** Shared with legacy キャンセル accent (error red). */
const actionRedClass = 'border-red-200 bg-red-50 text-error hover:bg-red-100'

/** Future/today「カルテ」: softer charcoal than pure black. */
const actionCharcoalClass =
  'border-slate-700 bg-slate-700 text-white hover:border-slate-800 hover:bg-slate-800'

const actionGrayClass =
  'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200'

const actionPurpleClass =
  'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'

function BookingStatusBadge({ status }: { status: string }) {
  const label = coachingStatusLabel(status)
  if (status === 'completed') {
    return (
      <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary">
        {label}
      </span>
    )
  }
  if (status === 'no_show') {
    return (
      <span className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-error">
        {label}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted">
      {label}
    </span>
  )
}

function formatBookingTimeRange(booking: CoachingBookingWithDetails): string {
  const start = booking.slot.start_time
    ? normalizeStartTime(booking.slot.start_time)
    : ''
  if (!start) return ''
  const end = addMinutesToTime(start, COACHING_SLOT_DURATION_MINUTES)
  return `${start}〜${end}`
}

function BookingActionButtons({
  booking,
  appearance,
  coaches,
  weekStart,
}: {
  booking: CoachingBookingWithDetails
  /** `legacy` = past collapsible panel styles; `always` = today/future row colors. */
  appearance: 'legacy' | 'always'
  coaches: CoachingCoach[]
  weekStart: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

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

  const completeLabel = appearance === 'always' ? '実施済み' : '実施済みにする'
  const showReschedule = appearance === 'always'

  const karteClass =
    appearance === 'always'
      ? `${actionButtonBaseClass} ${actionCharcoalClass}`
      : `${actionButtonBaseClass} ${actionBlueClass}`
  const completeClass =
    appearance === 'always'
      ? `${actionButtonBaseClass} ${actionBlueClass}`
      : `${actionButtonBaseClass} border-border hover:bg-background`
  const cancelClass =
    appearance === 'always'
      ? `${actionButtonBaseClass} ${actionGrayClass}`
      : `${actionButtonBaseClass} ${actionRedClass}`
  const rescheduleClass = `${actionButtonBaseClass} ${actionPurpleClass}`
  const noShowClass =
    appearance === 'always'
      ? `${actionButtonBaseClass} ${actionRedClass}`
      : `${actionButtonBaseClass} border-border hover:bg-background`

  return (
    <>
      <div
        className={
          appearance === 'always'
            ? 'flex max-w-full flex-wrap justify-end gap-2'
            : 'flex max-w-full shrink-0 flex-wrap gap-2'
        }
      >
        {booking.student && (
          <Link
            href={`/admin/coaching/karte/${booking.student.id}?booking=${booking.id}&coach=${booking.coach_id}`}
            className={karteClass}
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
            className={completeClass}
            aria-label={`${target}を実施済みにする`}
          >
            {completeLabel}
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
            className={cancelClass}
            aria-label={`${target}をキャンセルする`}
          >
            キャンセル
          </button>
        </form>
        {showReschedule && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setRescheduleOpen(true)}
            className={rescheduleClass}
            aria-label={`${target}の予約を変更する`}
          >
            予約変更
          </button>
        )}
        <form
          onSubmit={(event) =>
            runAction(event, `${target}を無断欠席にします。`, markCoachingBookingNoShow)
          }
        >
          <input type="hidden" name="bookingId" value={booking.id} />
          <button
            type="submit"
            disabled={pending}
            className={noShowClass}
            aria-label={`${target}を無断欠席にする`}
          >
            無断欠席
          </button>
        </form>
      </div>
      {rescheduleOpen && (
        <AdminCoachingRescheduleModal
          booking={booking}
          coaches={coaches}
          weekStart={weekStart}
          onClose={() => setRescheduleOpen(false)}
        />
      )}
    </>
  )
}

function BookingRow({
  booking,
  showPastScheduledHint = false,
  allowEditActions = false,
  actionAppearance = 'legacy',
  coaches,
  weekStart,
}: {
  booking: CoachingBookingWithDetails
  showPastScheduledHint?: boolean
  allowEditActions?: boolean
  /** Today/future rows show actions always; past keeps the edit toggle. */
  actionAppearance?: 'legacy' | 'always'
  coaches: CoachingCoach[]
  weekStart: string
}) {
  const [editing, setEditing] = useState(false)
  const studentName = booking.student ? getPersonName(booking.student) : '生徒'
  const timeRange = formatBookingTimeRange(booking)
  const dateLabel = formatCoachingDateLabel(
    booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10),
  )
  const canEdit = allowEditActions && booking.status === 'scheduled'
  const editAriaLabel = `${studentName} ${dateLabel} ${timeRange}を編集`
  const showAlwaysActions = canEdit && actionAppearance === 'always'
  const showCollapsedToggle = canEdit && actionAppearance === 'legacy'

  return (
    <li className="border-t border-border py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold tabular-nums">{timeRange}</span>
            <span>
              {studentName}
              <span className="text-muted"> / {booking.coach.name}</span>
            </span>
            <BookingStatusBadge status={booking.status} />
          </div>
          {showPastScheduledHint && booking.status === 'scheduled' && (
            <p className="mt-1 text-sm text-amber-800" role="status">
              実施状況を更新してください
            </p>
          )}
          {booking.student_note && (
            <p className="mt-1 text-sm text-muted">伝言: {booking.student_note}</p>
          )}
        </div>
        {showAlwaysActions && (
          <div className="ml-auto min-w-0 max-w-full">
            <BookingActionButtons
              booking={booking}
              appearance="always"
              coaches={coaches}
              weekStart={weekStart}
            />
          </div>
        )}
        {showCollapsedToggle && (
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
      {showCollapsedToggle && editing && (
        <div id={`booking-actions-${booking.id}`} className="mt-2">
          <BookingActionButtons
            booking={booking}
            appearance="legacy"
            coaches={coaches}
            weekStart={weekStart}
          />
        </div>
      )}
    </li>
  )
}

function DateBookingCards({
  bookings,
  emptyMessage,
  allowEditActions = false,
  showPastScheduledHint = false,
  dateOrder = 'asc',
  actionAppearance = 'legacy',
  coaches,
  weekStart,
}: {
  bookings: CoachingBookingWithDetails[]
  emptyMessage: string
  allowEditActions?: boolean
  showPastScheduledHint?: boolean
  dateOrder?: 'asc' | 'desc'
  actionAppearance?: 'legacy' | 'always'
  coaches: CoachingCoach[]
  weekStart: string
}) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted">
        {emptyMessage}
      </p>
    )
  }

  const groups = groupCoachingBookingsByDate(bookings, dateOrder)

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li
          key={group.dateKey}
          className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
        >
          <h3 className="text-sm font-bold">{group.label}</h3>
          <ul className="mt-2">
            {group.bookings.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                allowEditActions={allowEditActions}
                showPastScheduledHint={showPastScheduledHint}
                actionAppearance={actionAppearance}
                coaches={coaches}
                weekStart={weekStart}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
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
  coaches: CoachingCoach[]
  weekStart: string
}

export function AdminCoachingBookings({
  todayBookings,
  futureBookings,
  pastBookings,
  pastTotalCount,
  pastRangeLabel,
  pastSearchForm,
  pastPagination,
  coaches,
  weekStart,
}: AdminCoachingBookingsProps) {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">今日の予約</h2>
        <DateBookingCards
          bookings={todayBookings}
          emptyMessage="今日の予約はありません。"
          allowEditActions
          actionAppearance="always"
          coaches={coaches}
          weekStart={weekStart}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">今後（明日以降）の予約</h2>
        <DateBookingCards
          bookings={futureBookings}
          emptyMessage="明日以降の予約はありません。"
          allowEditActions
          actionAppearance="always"
          coaches={coaches}
          weekStart={weekStart}
        />
      </section>

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
          <DateBookingCards
            bookings={pastBookings}
            emptyMessage="該当する過去の予約はありません。"
            allowEditActions
            showPastScheduledHint
            dateOrder="desc"
            actionAppearance="legacy"
            coaches={coaches}
            weekStart={weekStart}
          />
        )}
        {pastPagination}
      </section>
    </div>
  )
}
