import Link from 'next/link'
import { formatStudyDateLabel, getJstDateKey, shiftDateKey } from '@/lib/study/dates'

interface AdminStudyDailyDateNavProps {
  selectedDate: string
}

export function AdminStudyDailyDateNav({ selectedDate }: AdminStudyDailyDateNavProps) {
  const todayKey = getJstDateKey()
  const prevDate = shiftDateKey(selectedDate, -1)
  const nextDate = shiftDateKey(selectedDate, 1)
  const canGoNext = selectedDate < todayKey

  const navButtonClass =
    'inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-card'

  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link
        href={`/admin/study-daily?date=${prevDate}`}
        scroll={false}
        className={navButtonClass}
      >
        ← 前日
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <p className="text-base font-bold">{formatStudyDateLabel(selectedDate, todayKey)}</p>
        <p className="mt-1 text-sm text-muted">{selectedDate}</p>
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
