'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  loadAvailableCoachingSlotsForWindow,
  loadCoachingGridForWeek,
  toggleCoachingSlot,
} from '@/app/coaching/actions'
import { COACHING_SLOT_TIMES, buildSlotDateTime, slotDateTimeKey } from '@/lib/coaching/slot-times'
import {
  COACHING_STUDENT_WINDOW_DAYS,
  formatDayRange,
  formatWeekRange,
  getDayWindow,
  getWeekdays,
  shiftStartDate,
  shiftWeekStart,
  type WeekDay,
} from '@/lib/coaching/week'
import type { AvailableCoachingSlot } from '@/types/coaching'
import type { CoachingGridSlot } from '@/lib/coaching/queries'
import { cn } from '@/lib/utils'

interface CoachingWeekGridProps {
  mode: 'admin' | 'student'
  coachId: string
  weekStart?: string
  windowStart?: string
  gridSlots?: CoachingGridSlot[]
  availableSlots?: AvailableCoachingSlot[]
  onSelectSlot?: (slot: AvailableCoachingSlot | null) => void
  selectedSlotId?: string | null
  onNavigate?: () => void
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
  pending,
  onPrevious,
  onNext,
}: {
  weekStart: string
  pending: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label="前の週"
      >
        ←
      </button>
      <p className="text-sm font-medium">{formatWeekRange(weekStart)}</p>
      <button
        type="button"
        onClick={onNext}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label="次の週"
      >
        →
      </button>
    </div>
  )
}

function StudentDayNav({
  windowStart,
  pending,
  onPrevious,
  onNext,
}: {
  windowStart: string
  pending: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  const days = getDayWindow(windowStart)

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label={`前の${COACHING_STUDENT_WINDOW_DAYS}日`}
      >
        ←
      </button>
      <p className="text-sm font-medium">{formatDayRange(days)}</p>
      <button
        type="button"
        onClick={onNext}
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        aria-label={`次の${COACHING_STUDENT_WINDOW_DAYS}日`}
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
  onToggled,
}: {
  coachId: string
  day: WeekDay
  startTime: string
  slot?: CoachingGridSlot
  onToggled: () => void
}) {
  const [pending, startTransition] = useTransition()

  const isPast = slot
    ? new Date(slot.starts_at) <= new Date()
    : buildSlotDateTime(day.date, startTime) <= new Date()

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
      onToggled()
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

export function CoachingWeekGrid({
  mode,
  coachId,
  weekStart: initialWeekStart = '',
  windowStart: initialWindowStart = '',
  gridSlots: initialGridSlots = [],
  availableSlots: initialAvailableSlots = [],
  onSelectSlot,
  selectedSlotId,
  onNavigate,
}: CoachingWeekGridProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [windowStart, setWindowStart] = useState(initialWindowStart)
  const [gridSlots, setGridSlots] = useState(initialGridSlots)
  const [availableSlots, setAvailableSlots] = useState(initialAvailableSlots)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (mode !== 'admin' || !coachId) return
    setWeekStart(initialWeekStart)
    setGridSlots(initialGridSlots)
    startTransition(async () => {
      const slots = await loadCoachingGridForWeek(coachId, initialWeekStart)
      setGridSlots(slots)
    })
  }, [coachId, initialWeekStart, initialGridSlots, mode])

  useEffect(() => {
    if (mode !== 'student' || !coachId) return
    setWindowStart(initialWindowStart)
    setAvailableSlots(initialAvailableSlots)
    startTransition(async () => {
      const slots = await loadAvailableCoachingSlotsForWindow(coachId, initialWindowStart)
      setAvailableSlots(slots)
    })
  }, [coachId, initialWindowStart, initialAvailableSlots, mode])

  function refreshAdminGrid(nextWeekStart: string) {
    startTransition(async () => {
      const slots = await loadCoachingGridForWeek(coachId, nextWeekStart)
      setGridSlots(slots)
    })
  }

  function refreshStudentSlots(nextWindowStart: string) {
    startTransition(async () => {
      const slots = await loadAvailableCoachingSlotsForWindow(coachId, nextWindowStart)
      setAvailableSlots(slots)
    })
  }

  function goWeek(offset: number) {
    const next = shiftWeekStart(weekStart, offset)
    setWeekStart(next)
    onNavigate?.()
    refreshAdminGrid(next)
  }

  function goWindow(offsetDays: number) {
    const next = shiftStartDate(windowStart, offsetDays)
    setWindowStart(next)
    onNavigate?.()
    refreshStudentSlots(next)
  }

  if (mode === 'student') {
    return (
      <>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <StudentDayNav
            windowStart={windowStart}
            pending={pending}
            onPrevious={() => goWindow(-COACHING_STUDENT_WINDOW_DAYS)}
            onNext={() => goWindow(COACHING_STUDENT_WINDOW_DAYS)}
          />

          <div className={cn('grid grid-cols-4 gap-2 sm:gap-3', pending && 'opacity-60')}>
            {getDayWindow(windowStart).map((day) => {
              const daySlots = availableSlots
                .filter((slot) => slot.slot_date === day.date)
                .sort((a, b) => a.start_time.localeCompare(b.start_time))

              return (
                <div key={day.date} className="min-w-0">
                  <div className="mb-2 text-center text-xs font-semibold text-muted sm:mb-3 sm:text-sm">
                    {day.label}
                  </div>
                  <div className="flex flex-col gap-1.5 sm:gap-2">
                    {daySlots.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted sm:py-6">—</div>
                    ) : (
                      daySlots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => onSelectSlot?.(slot)}
                          className={cn(
                            'h-9 w-full rounded-full border text-xs font-medium transition sm:h-10 sm:text-sm',
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

        {!pending && availableSlots.length === 0 && (
          <p className="mt-4 text-sm text-muted">この期間に予約できる枠はありません。</p>
        )}
      </>
    )
  }

  const weekdays = getWeekdays(weekStart)
  const gridMap = buildGridMap(gridSlots)

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm">
      <WeekNav
        weekStart={weekStart}
        pending={pending}
        onPrevious={() => goWeek(-1)}
        onNext={() => goWeek(1)}
      />

      <div
        className={cn('grid min-w-[640px] gap-2', pending && 'opacity-60')}
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
                    onToggled={() => refreshAdminGrid(weekStart)}
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
