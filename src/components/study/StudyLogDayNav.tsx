import Link from 'next/link'
import { formatDuration } from '@/lib/study/chart-data'
import { formatStudyDateLabel, getJstDateKey, shiftDateKey } from '@/lib/study/dates'
import { cn } from '@/lib/utils'

interface StudyLogDayNavProps {
  selectedDate: string
  dayTotalMinutes: number
  basePath?: string
  unreadFeedbackDates?: string[]
}

function NavUnreadBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white',
        className,
      )}
      aria-label="未読のコメントあり"
    >
      未読
    </span>
  )
}

export function StudyLogDayNav({
  selectedDate,
  dayTotalMinutes,
  basePath = '/dashboard/study/history',
  unreadFeedbackDates = [],
}: StudyLogDayNavProps) {
  const todayKey = getJstDateKey()
  const prevDate = shiftDateKey(selectedDate, -1)
  const nextDate = shiftDateKey(selectedDate, 1)
  const canGoNext = selectedDate < todayKey
  const unreadDates = new Set(unreadFeedbackDates)
  const hasUnreadOnSelected = unreadDates.has(selectedDate)
  const hasUnreadOnPrev = unreadDates.has(prevDate)
  const hasUnreadOnNext = unreadDates.has(nextDate)

  const navButtonClass =
    'relative inline-flex min-h-11 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-card'

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link
        href={`${basePath}?date=${prevDate}`}
        scroll={false}
        className={navButtonClass}
        aria-label={hasUnreadOnPrev ? '前日（未読のコメントあり）' : '前日'}
      >
        ← 前日
        {hasUnreadOnPrev && <NavUnreadBadge />}
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <p className="text-base font-bold">{formatStudyDateLabel(selectedDate, todayKey)}</p>
          {hasUnreadOnSelected && <NavUnreadBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">合計 {formatDuration(dayTotalMinutes)}</p>
      </div>

      {canGoNext ? (
        <Link
          href={`${basePath}?date=${nextDate}`}
          scroll={false}
          className={navButtonClass}
          aria-label={hasUnreadOnNext ? '翌日（未読のコメントあり）' : '翌日'}
        >
          翌日 →
          {hasUnreadOnNext && <NavUnreadBadge />}
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
