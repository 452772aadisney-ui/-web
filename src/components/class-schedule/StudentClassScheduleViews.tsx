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

function nextSessionBadge(params: {
  dayStatus: ClassScheduleDayWithSessions['status']
  session: ClassScheduleSession
  scheduleDate: string
  todayKey?: string
  nowTimeHHmm?: string
}): string | null {
  if (isSessionEffectivelyCancelled(params.dayStatus, params.session.status)) {
    return sessionStatusLabel({
      dayStatus: params.dayStatus,
      sessionStatus: params.session.status,
    })
  }
  if (
    params.todayKey &&
    params.nowTimeHHmm &&
    params.scheduleDate === params.todayKey &&
    params.session.end_time <= params.nowTimeHHmm
  ) {
    return '終了'
  }
  return null
}

function SessionList({
  dayStatus,
  sessions,
  scheduleDate,
  todayKey,
  nowTimeHHmm,
  showCancelled = true,
  viewerTargetSessionIds,
}: {
  dayStatus: ClassScheduleDayWithSessions['status']
  sessions: ClassScheduleSession[]
  scheduleDate: string
  todayKey?: string
  nowTimeHHmm?: string
  showCancelled?: boolean
  /** Session ids where the viewer is a targeted attendee. */
  viewerTargetSessionIds?: ReadonlySet<string>
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
        const badge = nextSessionBadge({
          dayStatus,
          session,
          scheduleDate,
          todayKey,
          nowTimeHHmm,
        })
        const audience = session.audience_type ?? 'all_kisotsu'
        const isTarget =
          audience === 'all_kisotsu' ||
          Boolean(viewerTargetSessionIds?.has(session.id))
        const isNonTarget = audience === 'targeted' && !isTarget

        let rowClass =
          'rounded-lg bg-background px-3 py-2 text-sm text-foreground'
        if (cancelled) {
          rowClass =
            'rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted line-through'
        } else if (badge === '終了') {
          rowClass = 'rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted'
        } else if (isNonTarget) {
          // Readable muted (not invisible): keep contrast for body text
          rowClass = 'rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted'
        } else if (audience === 'targeted' && isTarget) {
          rowClass =
            'rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground'
        }

        return (
          <li key={session.id} className={rowClass}>
            <p className="font-medium">
              {formatSessionTimeRange(session.start_time, session.end_time)}{' '}
              <span className="break-words">{session.subject}</span>
              {badge && (
                <span className="ml-2 text-xs font-semibold no-underline">{badge}</span>
              )}
            </p>
            {!cancelled && audience === 'targeted' && isTarget ? (
              <p className="mt-0.5 text-xs font-medium text-primary">対象の授業</p>
            ) : null}
            {!cancelled && isNonTarget ? (
              <p className="mt-0.5 text-xs">他の生徒向け</p>
            ) : null}
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

export function StudentClassScheduleNextHero({
  next,
  todayKey,
  nowTimeHHmm,
  viewerTargetSessionIds,
}: {
  next: NextClassDay | null
  todayKey: string
  nowTimeHHmm: string
  viewerTargetSessionIds?: ReadonlySet<string>
}) {
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
      <SessionList
        dayStatus={next.status}
        sessions={next.sessions}
        scheduleDate={next.schedule_date}
        todayKey={todayKey}
        nowTimeHHmm={nowTimeHHmm}
        showCancelled
        viewerTargetSessionIds={viewerTargetSessionIds}
      />
    </section>
  )
}

export function StudentClassScheduleDayCards({
  days,
  emptyMessage,
  viewerTargetSessionIds,
}: {
  days: ClassScheduleDayWithSessions[]
  emptyMessage: string
  viewerTargetSessionIds?: ReadonlySet<string>
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
          <SessionList
            dayStatus={day.status}
            sessions={day.sessions}
            scheduleDate={day.schedule_date}
            viewerTargetSessionIds={viewerTargetSessionIds}
          />
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
