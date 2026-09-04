'use client'

import { useState } from 'react'
import { SubjectStudyPieChart } from '@/components/study/SubjectStudyPieChart'
import type { SubjectChartRow } from '@/lib/study/chart-data'
import {
  pickSubjectPieData,
  type SubjectPiePeriod,
} from '@/lib/study/subject-pie-period'
import { cn } from '@/lib/utils'

export type { SubjectPiePeriod }

interface SubjectStudyPieSectionProps {
  data14: SubjectChartRow[]
  dataAll: SubjectChartRow[]
  /** Initial selection only; toggles use client state (no page navigation). */
  initialPeriod?: SubjectPiePeriod
  compact?: boolean
}

/**
 * Subject pie with 14-day / all-time toggle.
 * Both datasets are provided up front; switching only updates local state so the
 * surrounding page (scroll position, form drafts, etc.) is not remounted.
 */
export function SubjectStudyPieSection({
  data14,
  dataAll,
  initialPeriod = 'all',
  compact = false,
}: SubjectStudyPieSectionProps) {
  const [period, setPeriod] = useState<SubjectPiePeriod>(initialPeriod)
  const pieData = pickSubjectPieData(period, data14, dataAll)

  const toggleClass = (active: boolean) =>
    cn(
      'rounded-lg px-3 py-1.5 text-sm font-medium transition',
      active
        ? 'bg-primary text-white'
        : 'border border-border bg-background text-foreground hover:bg-card',
    )

  return (
    <div>
      <div
        className={cn(
          'mb-4 flex flex-wrap items-center justify-between gap-3',
          compact && 'mb-3',
        )}
      >
        <h2 className={cn('font-bold', compact ? 'text-base' : 'text-lg')}>科目別の学習割合</h2>
        <div className="flex gap-2" role="group" aria-label="集計期間">
          <button
            type="button"
            onClick={() => setPeriod('14')}
            className={toggleClass(period === '14')}
            aria-pressed={period === '14'}
          >
            直近14日
          </button>
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className={toggleClass(period === 'all')}
            aria-pressed={period === 'all'}
          >
            全期間
          </button>
        </div>
      </div>
      <SubjectStudyPieChart data={pieData} />
    </div>
  )
}
