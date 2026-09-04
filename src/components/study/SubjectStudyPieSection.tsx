'use client'

import Link from 'next/link'
import { SubjectStudyPieChart } from '@/components/study/SubjectStudyPieChart'
import type { SubjectChartRow } from '@/lib/study/chart-data'
import { cn } from '@/lib/utils'

export type SubjectPiePeriod = '14' | 'all'

interface SubjectStudyPieSectionProps {
  data14: SubjectChartRow[]
  dataAll: SubjectChartRow[]
  initialPeriod?: SubjectPiePeriod
  compact?: boolean
  basePath?: string
  preserveParams?: Record<string, string | undefined>
}

export function SubjectStudyPieSection({
  data14,
  dataAll,
  initialPeriod = 'all',
  compact = false,
  basePath,
  preserveParams,
}: SubjectStudyPieSectionProps) {
  const period = initialPeriod
  const pieData = period === '14' ? data14 : dataAll

  function buildPeriodHref(nextPeriod: SubjectPiePeriod) {
    if (!basePath) return '#'

    const params = new URLSearchParams()
    if (preserveParams) {
      for (const [key, value] of Object.entries(preserveParams)) {
        if (value) params.set(key, value)
      }
    }

    if (nextPeriod === '14') {
      params.set('piePeriod', '14')
    } else {
      params.delete('piePeriod')
    }

    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

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
          {basePath ? (
            <>
              <Link href={buildPeriodHref('14')} scroll={false} className={toggleClass(period === '14')}>
                直近14日
              </Link>
              <Link href={buildPeriodHref('all')} scroll={false} className={toggleClass(period === 'all')}>
                全期間
              </Link>
            </>
          ) : (
            <>
              <span className={toggleClass(period === '14')}>直近14日</span>
              <span className={toggleClass(period === 'all')}>全期間</span>
            </>
          )}
        </div>
      </div>
      <SubjectStudyPieChart data={pieData} />
    </div>
  )
}
