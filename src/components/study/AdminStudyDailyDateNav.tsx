import Link from 'next/link'
import { formatStudyDateLabel, getJstDateKey, shiftDateKey } from '@/lib/study/dates'
import { cn } from '@/lib/utils'

interface AdminStudyDailyDateNavProps {
  selectedDate: string
  selectedDayIncompleteCount?: number
  prevDayIncompleteCount?: number
}

function NavCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white',
        className,
      )}
      aria-label={`未返信 ${count}件`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function AdminStudyDailyDateNav({
  selectedDate,
  selectedDayIncompleteCount = 0,
  prevDayIncompleteCount = 0,
}: AdminStudyDailyDateNavProps) {
  const todayKey = getJstDateKey()
  const prevDate = shiftDateKey(selectedDate, -1)
  const nextDate = shiftDateKey(selectedDate, 1)
  const canGoNext = selectedDate < todayKey

  const navButtonClass =
    'relative inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-card'

  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link
        href={`/admin/study-daily?date=${prevDate}`}
        scroll={false}
        className={navButtonClass}
        aria-label={
          prevDayIncompleteCount > 0
            ? `前日（未返信 ${prevDayIncompleteCount}件）`
            : '前日'
        }
      >
        ← 前日
        <NavCountBadge count={prevDayIncompleteCount} className="absolute -right-1.5 -top-1.5" />
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <p className="text-base font-bold">{formatStudyDateLabel(selectedDate, todayKey)}</p>
        <p className="mt-1 text-sm text-muted">{selectedDate}</p>
        {selectedDayIncompleteCount > 0 && (
          <div className="mt-2 flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
              未返信
              <NavCountBadge count={selectedDayIncompleteCount} />
            </span>
          </div>
        )}
      </div>

      {canGoNext ? (
        <Link
          href={`/admin/study-daily?date=${nextDate}`}
          scroll={false}
          className={navButtonClass}
        >
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
