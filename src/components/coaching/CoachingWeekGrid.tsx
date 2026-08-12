'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toggleCoachingSlot } from '@/app/coaching/actions'
import { COACHING_SLOT_TIMES, slotDateTimeKey } from '@/lib/coaching/slot-times'
import { formatWeekRange, getWeekdays, shiftWeekStart, type WeekDay } from '@/lib/coaching/week'
import type { AvailableCoachingSlot } from '@/types/coaching'
import type { CoachingGridSlot } from '@/lib/coaching/queries'
import { cn } from '@/lib/utils'

interface CoachingWeekGridProps {
  mode: 'admin' | 'student'
  coachId: string
  weekStart: string
  gridSlots: CoachingGridSlot[]
  availableSlots?: AvailableCoachingSlot[]
  onSelectSlot?: (slot: AvailableCoachingSlot) => void
  selectedSlotId?: string | null
}

function buildGridMap(slots: CoachingGridSlot[]) {
  const map = new Map<string, CoachingGridSlot>()
  for (const slot of slots) {
    map.set(slotDateTimeKey(slot.slot_date, slot.start_time), slot)
  }
  return map
}

function WeekNav({
  weekStart,
  coachId,
  basePath,
}: {
  weekStart: string
  coachId: string
  basePath: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function goWeek(offset: number) {
    const next = shiftWeekStart(weekStart, offset)
    startTransition(() => {
      router.push(`${basePath}?coach=${coachId}&week=${next}`)
    })
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => goWeek(-1)}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label="前の週"
      >
        ←
      </button>
      <p className="text-sm font-medium">{formatWeekRange(weekStart)}</p>
      <button
        type="button"
        onClick={() => goWeek(1)}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label="次の週"
      >
        →
      </button>
    </div>
  )
}

function AdminCell({
  coachId,
  day,
  startTime,
  slot,
}: {
  coachId: string
  day: WeekDay
  startTime: string
  slot?: CoachingGridSlot
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const isPast = slot
    ? new Date(slot.starts_at) <= new Date()
    : new Date(`${day.date}T${startTime}:00`) <= new Date()

  if (isPast) {
    return <div className="h-10 rounded-full bg-muted/20" />
  }

  const isOpen = slot?.is_open ?? false
  const isBooked = slot?.is_booked ?? false

  function handleClick() {
    if (isBooked) return
    startTransition(async () => {
      await toggleCoachingSlot(
        (() => {
          const fd = new FormData()
          fd.set('coachId', coachId)
          fd.set('slotDate', day.date)
          fd.set('startTime', startTime)
          fd.set('open', isOpen ? 'false' : 'true')
          return fd
        })(),
      )
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || isBooked}
      className={cn(
        'h-10 w-full rounded-full border text-sm font-medium transition',
        isBooked && 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-800',
        !isBooked && isOpen && 'border-primary bg-blue-50 text-primary hover:bg-blue-100',
        !isBooked && !isOpen && 'border-border bg-white text-muted hover:border-primary/40',
        pending && 'opacity-60',
      )}
    >
      {isBooked ? '予約済' : startTime}
    </button>
  )
}

function StudentWeekGrid({
  weekStart,
  coachId,
  availableSlots,
  selectedSlotId,
  onSelectSlot,
}: {
  weekStart: string
  coachId: string
  availableSlots: AvailableCoachingSlot[]
  selectedSlotId?: string | null
  onSelectSlot?: (slot: AvailableCoachingSlot) => void
}) {
  const weekdays = getWeekdays(weekStart)
  const slotsByDay = new Map<string, AvailableCoachingSlot[]>()

  for (const slot of availableSlots) {
    const list = slotsByDay.get(slot.slot_date) ?? []
    list.push(slot)
    slotsByDay.set(slot.slot_date, list)
  }

  for (const list of slotsByDay.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm">
      <WeekNav weekStart={weekStart} coachId={coachId} basePath="/dashboard/coaching" />

      <div className="grid min-w-[480px] grid-cols-5 gap-3">
        {weekdays.map((day) => {
          const daySlots = slotsByDay.get(day.date) ?? []

          return (
            <div key={day.date} className="min-w-0">
              <div className="mb-3 text-center text-sm font-semibold text-muted">{day.label}</div>
              <div className="flex flex-col gap-2">
                {daySlots.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted">—</div>
                ) : (
                  daySlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => onSelectSlot?.(slot)}
                      className={cn(
                        'h-10 w-full rounded-full border text-sm font-medium transition',
                        selectedSlotId === slot.id
                          ? 'border-primary bg-primary text-white'
                          : 'border-primary/30 bg-white text-primary hover:bg-blue-50',
                      )}
                    >
                      {slot.start_time}
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CoachingWeekGrid({
  mode,
  coachId,
  weekStart,
  gridSlots,
  availableSlots = [],
  onSelectSlot,
  selectedSlotId,
}: CoachingWeekGridProps) {
  if (mode === 'student') {
    return (
      <StudentWeekGrid
        weekStart={weekStart}
        coachId={coachId}
        availableSlots={availableSlots}
        selectedSlotId={selectedSlotId}
        onSelectSlot={onSelectSlot}
      />
    )
  }

  const weekdays = getWeekdays(weekStart)
  const gridMap = buildGridMap(gridSlots)
  const basePath = '/admin/coaching'

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm">
      <WeekNav weekStart={weekStart} coachId={coachId} basePath={basePath} />

      <div
        className="grid min-w-[640px] gap-2"
        style={{ gridTemplateColumns: `64px repeat(${weekdays.length}, minmax(0, 1fr))` }}
      >
        <div />
        {weekdays.map((day) => (
          <div key={day.date} className="text-center text-sm font-semibold text-muted">
            {day.label}
          </div>
        ))}

        {COACHING_SLOT_TIMES.map((startTime) => (
          <div key={startTime} className="contents">
            <div className="flex items-center justify-end pr-2 text-xs text-muted">{startTime}</div>
            {weekdays.map((day) => {
              const key = slotDateTimeKey(day.date, startTime)
              const gridSlot = gridMap.get(key)

              return (
                <div key={key} className="px-0.5">
                  <AdminCell
                    coachId={coachId}
                    day={day}
                    startTime={startTime}
                    slot={gridSlot}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        枠をクリックすると開放/クローズを切り替えられます。予約済みの枠は閉じられません。
      </p>
    </div>
  )
}
