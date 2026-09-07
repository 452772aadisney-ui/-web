import Link from 'next/link'
import {
  dayStatusLabel,
  formatClassScheduleDateLabel,
  formatSessionTimeRange,
  isSessionEffectivelyCancelled,
  sessionStatusLabel,
} from '@/lib/class-schedule/format'
import { resolveLocationDetailsText } from '@/lib/class-schedule/location-details'
import type { ClassScheduleDayWithSessions } from '@/types/class-schedule'

function truncateTwoLines(value: string, max = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

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
    <ul className="space-y-2">
      {days.map((day) => {
        const location = resolveLocationDetailsText(day)
        const dateLabel = formatClassScheduleDateLabel(day.schedule_date)
        return (
          <li
            key={day.id}
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{dateLabel}</p>
                <p className="mt-0.5 text-sm text-muted">{day.venue_name}</p>
                {location && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {truncateTwoLines(location)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {day.status === 'cancelled' ? (
                  <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {dayStatusLabel(day.status)}
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    開催予定
                  </span>
                )}
                <Link
                  href={`/admin/class-schedule/${day.id}`}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={`${dateLabel} ${day.venue_name}を編集`}
                >
                  編集
                </Link>
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-sm">
              {day.sessions.length === 0 ? (
                <li className="text-muted">コマなし</li>
              ) : (
                day.sessions.map((session) => {
                  const cancelled = isSessionEffectivelyCancelled(
                    day.status,
                    session.status,
                  )
                  return (
                    <li
                      key={session.id}
                      className={cancelled ? 'text-muted line-through' : ''}
                    >
                      {formatSessionTimeRange(session.start_time, session.end_time)}{' '}
                      <span className="break-words">{session.subject}</span>
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
          </li>
        )
      })}
    </ul>
  )
}
