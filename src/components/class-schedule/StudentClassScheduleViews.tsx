import Link from 'next/link'
import {
  dayStatusLabel,
  formatClassScheduleDateLabel,
  formatSessionTimeRange,
  isSessionEffectivelyCancelled,
  sessionStatusLabel,
} from '@/lib/class-schedule/format'
import {
  renderLocationDetailsWithLinks,
  resolveLocationDetailsText,
} from '@/lib/class-schedule/location-details'
import type {
  ClassScheduleDayWithSessions,
  ClassScheduleSession,
} from '@/types/class-schedule'
import type { NextClassDay } from '@/lib/class-schedule/queries'

function LocationBlock({ day }: { day: ClassScheduleDayWithSessions | NextClassDay }) {
  const text = resolveLocationDetailsText(day)
  if (!text) return null
  return (
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
      {renderLocationDetailsWithLinks(text, day.id)}
    </p>
  )
}

function SessionList({
  dayStatus,
  sessions,
  showCancelled = true,
}: {
  dayStatus: ClassScheduleDayWithSessions['status']
  sessions: ClassScheduleSession[]
  showCancelled?: boolean
}) {
  const visible = showCancelled
    ? sessions
    : sessions.filter((session) => session.status === 'scheduled')

  if (visible.length === 0) {
    return <p className="text-sm text-muted">コマはありません</p>
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {visible.map((session) => {
        const cancelled = isSessionEffectivelyCancelled(dayStatus, session.status)
        return (
          <li
            key={session.id}
            className={
              cancelled
                ? 'rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted line-through'
                : 'rounded-lg bg-background px-3 py-2 text-sm'
            }
          >
            <p className="font-medium">
              {formatSessionTimeRange(session.start_time, session.end_time)}{' '}
              <span className="break-words">{session.subject}</span>
              {cancelled && (
                <span className="ml-2 text-xs font-semibold no-underline">
                  {sessionStatusLabel({ dayStatus, sessionStatus: session.status })}
                </span>
              )}
            </p>
            {session.note && (
              <p className="mt-0.5 break-words text-xs text-muted no-underline">
                {session.note}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function StudentClassScheduleNextHero({ next }: { next: NextClassDay | null }) {
  if (!next) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-muted">次の授業</h2>
        <p className="mt-2 text-base font-bold">予定されている授業はありません</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-muted">次の授業</h2>
      <p className="mt-2 text-xl font-bold">
        {formatClassScheduleDateLabel(next.schedule_date)}
      </p>
      <p className="mt-1 text-sm font-semibold">{next.venue_name}</p>
      <LocationBlock day={next} />
      <SessionList dayStatus={next.status} sessions={next.sessions} showCancelled={false} />
    </section>
  )
}

export function StudentClassScheduleDayCards({
  days,
  emptyMessage,
}: {
  days: ClassScheduleDayWithSessions[]
  emptyMessage: string
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-3">
      {days.map((day) => (
        <li
          key={day.id}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-bold">
                {formatClassScheduleDateLabel(day.schedule_date)}
              </p>
              <p className="mt-0.5 text-sm text-muted">{day.venue_name}</p>
            </div>
            {day.status === 'cancelled' && (
              <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                {dayStatusLabel(day.status)}
              </span>
            )}
          </div>
          <LocationBlock day={day} />
          <SessionList dayStatus={day.status} sessions={day.sessions} />
        </li>
      ))}
    </ul>
  )
}

export function StudentClassSchedulePastLink() {
  return (
    <p className="text-center">
      <Link
        href="/dashboard/class-schedule/past"
        className="text-sm font-medium text-primary hover:underline"
      >
        過去の授業予定を見る
      </Link>
    </p>
  )
}
