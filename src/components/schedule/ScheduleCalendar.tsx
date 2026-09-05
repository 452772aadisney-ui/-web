'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import {
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_LABELS,
  type CalendarEvent,
  groupEventsByDate,
  getEventDates,
} from '@/lib/calendar/events'
import { getJstDateKey, isValidDateKey, toLocalDateKey } from '@/lib/study/dates'
import { cn } from '@/lib/utils'

interface ScheduleCalendarProps {
  events: CalendarEvent[]
  /**
   * YYYY-MM-DD — treated as a JST calendar date (year/month/day parts).
   * Precedence: when `initialDate` is a valid date key, it wins over `initialMonth`
   * (selection + visible month both come from that date).
   */
  initialDate?: string
  /** YYYY-MM — month to display when no valid `initialDate` is selected. */
  initialMonth?: string
}

function parseCalendarDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function parseMonthKey(monthKey: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return new Date(y, m - 1, 1)
}

function toMonthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * URL search param precedence:
 * 1. valid `date` (YYYY-MM-DD) → select that day and show its month
 * 2. else valid `month` (YYYY-MM) → show that month with no day selected
 * 3. else → select today (JST) and show its month
 */
function resolveInitialState(initialDate?: string, initialMonth?: string) {
  if (initialDate && isValidDateKey(initialDate)) {
    const selected = parseCalendarDateKey(initialDate)
    return { selected, month: selected }
  }

  const monthFromParam = initialMonth ? parseMonthKey(initialMonth) : null
  if (monthFromParam) {
    return { selected: undefined as Date | undefined, month: monthFromParam }
  }

  const today = parseCalendarDateKey(getJstDateKey())
  return { selected: today, month: today }
}

export function ScheduleCalendar({
  events,
  initialDate,
  initialMonth,
}: ScheduleCalendarProps) {
  const router = useRouter()
  const initial = useMemo(
    () => resolveInitialState(initialDate, initialMonth),
    [initialDate, initialMonth],
  )
  const [selected, setSelected] = useState<Date | undefined>(initial.selected)
  const [month, setMonth] = useState<Date>(initial.month)
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events])
  const eventDates = useMemo(() => getEventDates(events), [events])

  // Keep UI in sync when search params change (history links, back/forward).
  useEffect(() => {
    const next = resolveInitialState(initialDate, initialMonth)
    setSelected(next.selected)
    setMonth(next.month)
  }, [initialDate, initialMonth])

  const selectedKey = selected ? toLocalDateKey(selected) : null
  const dayEvents = selectedKey ? (eventsByDate.get(selectedKey) ?? []) : []

  const upcoming = useMemo(() => {
    const today = getJstDateKey()
    return events.filter((e) => e.date >= today).slice(0, 10)
  }, [events])

  function syncUrl(nextSelected: Date | undefined, nextMonth: Date) {
    const params = new URLSearchParams()
    if (nextSelected) {
      params.set('date', toLocalDateKey(nextSelected))
    } else {
      params.set('month', toMonthKey(nextMonth))
    }
    const qs = params.toString()
    const nextPath = `/dashboard/calendar?${qs}`
    if (typeof window !== 'undefined') {
      const current = `${window.location.pathname}${window.location.search}`
      if (current === nextPath) return
    }
    router.replace(nextPath, { scroll: false })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1fr]">
      <section className="w-full min-w-0 rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-4">
        <Calendar
          className="w-full"
          mode="single"
          month={month}
          onMonthChange={(nextMonth) => {
            setMonth(nextMonth)
            const keepSelected =
              selected &&
              selected.getFullYear() === nextMonth.getFullYear() &&
              selected.getMonth() === nextMonth.getMonth()
                ? selected
                : undefined
            if (!keepSelected) setSelected(undefined)
            syncUrl(keepSelected, nextMonth)
          }}
          selected={selected}
          onSelect={(next) => {
            setSelected(next)
            if (next) {
              setMonth(next)
              syncUrl(next, next)
            } else {
              syncUrl(undefined, month)
            }
          }}
          labels={{
            labelPrevious: () => '前の月へ',
            labelNext: () => '次の月へ',
          }}
          modifiers={{ hasEvent: eventDates }}
          modifiersClassNames={{
            hasEvent:
              'relative font-semibold after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {(Object.keys(CALENDAR_EVENT_LABELS) as Array<keyof typeof CALENDAR_EVENT_LABELS>).map(
            (type) => (
              <span key={type} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className={cn('h-2 w-2 rounded-full', CALENDAR_EVENT_COLORS[type])} />
                {CALENDAR_EVENT_LABELS[type]}
              </span>
            ),
          )}
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">
            {selected
              ? format(selected, 'yyyy年M月d日（E）', { locale: ja })
              : '日付を選択'}
          </h2>
          {dayEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted">この日の予定はありません。</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {dayEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">今後の予定</h2>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted">予定はありません。</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} showDate />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function EventCard({ event, showDate = false }: { event: CalendarEvent; showDate?: boolean }) {
  const [y, m, d] = event.date.split('-')

  return (
    <li className="flex gap-3 rounded-lg border border-border bg-background p-3">
      <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', CALENDAR_EVENT_COLORS[event.type])} />
      <div>
        <p className="text-xs font-medium text-primary">{CALENDAR_EVENT_LABELS[event.type]}</p>
        <p className="font-medium">{event.title}</p>
        {showDate && (
          <p className="text-xs text-muted">
            {Number(y)}年{Number(m)}月{Number(d)}日
          </p>
        )}
        {event.subject && <p className="text-sm text-muted">{event.subject}</p>}
        {event.detail && <p className="mt-1 text-xs text-muted">{event.detail}</p>}
      </div>
    </li>
  )
}
