import Link from 'next/link'
import { formatDuration } from '@/lib/study/chart-data'
import { formatStudyDateLabel, getJstDateKey, shiftDateKey } from '@/lib/study/dates'

interface StudyLogDayNavProps {
  selectedDate: string
  dayTotalMinutes: number
}

export function StudyLogDayNav({ selectedDate, dayTotalMinutes }: StudyLogDayNavProps) {
  const todayKey = getJstDateKey()
  const prevDate = shiftDateKey(selectedDate, -1)
  const nextDate = shiftDateKey(selectedDate, 1)
  const canGoNext = selectedDate < todayKey

  const navButtonClass =
    'inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-card'

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href={`/dashboard/study?date=${prevDate}`} className={navButtonClass}>
        ← 前日
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <p className="text-base font-bold">{formatStudyDateLabel(selectedDate, todayKey)}</p>
        <p className="mt-1 text-sm text-muted">合計 {formatDuration(dayTotalMinutes)}</p>
      </div>

      {canGoNext ? (
        <Link href={`/dashboard/study?date=${nextDate}`} className={navButtonClass}>
          翌日 →
        </Link>
      ) : (
        <span
          className={`${navButtonClass} cursor-not-allowed text-muted opacity-40`}
          aria-hidden
        >
          翌日 →
        </span>
      )}
    </div>
  )
}
