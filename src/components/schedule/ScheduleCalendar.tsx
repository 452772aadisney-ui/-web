'use client'

import { useMemo, useState } from 'react'
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
import { toLocalDateKey } from '@/lib/study/dates'
import { cn } from '@/lib/utils'

interface ScheduleCalendarProps {
  events: CalendarEvent[]
}

export function ScheduleCalendar({ events }: ScheduleCalendarProps) {
  const [selected, setSelected] = useState<Date | undefined>(new Date())
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events])
  const eventDates = useMemo(() => getEventDates(events), [events])

  const selectedKey = selected ? toLocalDateKey(selected) : null
  const dayEvents = selectedKey ? (eventsByDate.get(selectedKey) ?? []) : []

  const upcoming = useMemo(() => {
    const today = toLocalDateKey(new Date())
    return events.filter((e) => e.date >= today).slice(0, 10)
  }, [events])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1fr]">
      <section className="w-full min-w-0 rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-4">
        <Calendar
          className="w-full"
          mode="single"
          selected={selected}
          onSelect={setSelected}
          modifiers={{ hasEvent: eventDates }}
          modifiersClassNames={{
            hasEvent: 'relative font-semibold after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {(Object.keys(CALENDAR_EVENT_LABELS) as Array<keyof typeof CALENDAR_EVENT_LABELS>).map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className={cn('h-2 w-2 rounded-full', CALENDAR_EVENT_COLORS[type])} />
              {CALENDAR_EVENT_LABELS[type]}
            </span>
          ))}
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
          <p className="text-xs text-muted">{Number(y)}年{Number(m)}月{Number(d)}日</p>
        )}
        {event.subject && <p className="text-sm text-muted">{event.subject}</p>}
        {event.detail && <p className="mt-1 text-xs text-muted">{event.detail}</p>}
      </div>
    </li>
  )
}
