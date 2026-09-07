import Link from 'next/link'
import {
  dayStatusLabel,
  formatClassScheduleDateLabel,
  formatSessionTimeRange,
  isSessionEffectivelyCancelled,
  sessionStatusLabel,
} from '@/lib/class-schedule/format'
import type { ClassScheduleDayWithSessions } from '@/types/class-schedule'

export function AdminClassScheduleDayList({
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
        <li key={day.id}>
          <Link
            href={`/admin/class-schedule/${day.id}`}
            className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40"
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
            <ul className="mt-3 space-y-1 text-sm">
              {day.sessions.length === 0 ? (
                <li className="text-muted">コマなし</li>
              ) : (
                day.sessions.map((session) => {
                  const cancelled = isSessionEffectivelyCancelled(day.status, session.status)
                  return (
                    <li
                      key={session.id}
                      className={cancelled ? 'text-muted line-through' : ''}
                    >
                      {formatSessionTimeRange(session.start_time, session.end_time)}{' '}
                      {session.subject}
                      {cancelled && (
                        <span className="ml-1 text-xs font-semibold no-underline">
                          {sessionStatusLabel({
                            dayStatus: day.status,
                            sessionStatus: session.status,
                          })}
                        </span>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
          </Link>
        </li>
      ))}
    </ul>
  )
}
