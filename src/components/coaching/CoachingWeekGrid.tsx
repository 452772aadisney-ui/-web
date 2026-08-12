'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent } from 'react'
import {
  loadAvailableCoachingSlotsForWindow,
  loadCoachingGridForWeek,
  setCoachingSlotsOpen,
  type CoachingSlotSelection,
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

function parseSlotKey(key: string): CoachingSlotSelection {
  const separatorIndex = key.indexOf('_')
  return {
    slotDate: key.slice(0, separatorIndex),
    startTime: key.slice(separatorIndex + 1),
  }
}

function AdminWeekGrid({
  coachId,
  weekStart,
  gridSlots,
  pending,
  onRefresh,
}: {
  coachId: string
  weekStart: string
  gridSlots: CoachingGridSlot[]
  pending: boolean
  onRefresh: () => void
}) {
  const weekdays = getWeekdays(weekStart)
  const gridMap = buildGridMap(gridSlots)
  const [drag, setDrag] = useState<{ paintOpen: boolean; keys: Set<string> } | null>(null)
  const [saving, startSaveTransition] = useTransition()
  const dragRef = useRef(drag)
  dragRef.current = drag

  const getCellMeta = useCallback(
    (slotDate: string, startTime: string) => {
      const key = slotDateTimeKey(slotDate, startTime)
      const slot = gridMap.get(key)
      const isPast = slot
        ? new Date(slot.starts_at) <= new Date()
        : buildSlotDateTime(slotDate, startTime) <= new Date()
      const isOpen = slot?.is_open ?? false
      const isBooked = slot?.is_booked ?? false

      return { key, isPast, isOpen, isBooked }
    },
    [gridMap],
  )

  const finishDrag = useCallback(() => {
    const currentDrag = dragRef.current
    if (!currentDrag) return

    setDrag(null)

    const selections = [...currentDrag.keys]
      .map(parseSlotKey)
      .filter(({ slotDate, startTime }) => {
        const meta = getCellMeta(slotDate, startTime)
        return !meta.isPast && !meta.isBooked
      })

    if (selections.length === 0) return

    startSaveTransition(async () => {
      await setCoachingSlotsOpen(coachId, selections, currentDrag.paintOpen)
      onRefresh()
    })
  }, [coachId, getCellMeta, onRefresh])

  useEffect(() => {
    if (!drag) return

    const handlePointerUp = () => finishDrag()

    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [drag, finishDrag])

  function beginDrag(day: WeekDay, startTime: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || saving) return

    const meta = getCellMeta(day.date, startTime)
    if (meta.isPast || meta.isBooked) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    setDrag({
      paintOpen: !meta.isOpen,
      keys: new Set([meta.key]),
    })
  }

  function extendDrag(day: WeekDay, startTime: string) {
    setDrag((current) => {
      if (!current) return current

      const meta = getCellMeta(day.date, startTime)
      if (meta.isPast || meta.isBooked || current.keys.has(meta.key)) return current

      const keys = new Set(current.keys)
      keys.add(meta.key)
      return { ...current, keys }
    })
  }

  const isBusy = pending || saving

  return (
    <>
      <div
        className={cn('grid min-w-[640px] select-none gap-2 touch-none', isBusy && 'opacity-60')}
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
              const meta = getCellMeta(day.date, startTime)
              const isPainted = drag?.keys.has(meta.key) ?? false
              const displayOpen = isPainted ? (drag?.paintOpen ?? meta.isOpen) : meta.isOpen

              if (meta.isPast) {
                return <div key={meta.key} className="h-10 rounded-full bg-muted/20" />
              }

              return (
                <div key={meta.key} className="px-0.5">
                  <button
                    type="button"
                    onPointerDown={(event) => beginDrag(day, startTime, event)}
                    onPointerEnter={() => extendDrag(day, startTime)}
                    disabled={isBusy || meta.isBooked}
                    className={cn(
                      'h-10 w-full rounded-full border text-sm font-medium transition',
                      meta.isBooked && 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-800',
                      !meta.isBooked &&
                        displayOpen &&
                        'border-primary bg-blue-50 text-primary hover:bg-blue-100',
                      !meta.isBooked &&
                        !displayOpen &&
                        'border-border bg-white text-muted hover:border-primary/40',
                      isPainted && !meta.isBooked && 'ring-2 ring-primary/30',
                    )}
                  >
                    {meta.isBooked ? '予約済' : startTime}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        枠をクリック、またはドラッグして開放/クローズを切り替えられます。予約済みの枠は変更できません。
      </p>
    </>
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

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm">
      <WeekNav
        weekStart={weekStart}
        pending={pending}
        onPrevious={() => goWeek(-1)}
        onNext={() => goWeek(1)}
      />

      <AdminWeekGrid
        coachId={coachId}
        weekStart={weekStart}
        gridSlots={gridSlots}
        pending={pending}
        onRefresh={() => refreshAdminGrid(weekStart)}
      />
    </div>
  )
}
