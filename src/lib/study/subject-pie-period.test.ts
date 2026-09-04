import { describe, expect, it } from 'vitest'
import { pickSubjectPieData } from '@/lib/study/subject-pie-period'
import type { SubjectChartRow } from '@/lib/study/chart-data'

const data14: SubjectChartRow[] = [{ name: '数学', value: 60, minutes: 60 }]
const dataAll: SubjectChartRow[] = [
  { name: '数学', value: 120, minutes: 120 },
  { name: '英語', value: 90, minutes: 90 },
]

describe('pickSubjectPieData', () => {
  it('returns 14-day data when period is 14', () => {
    expect(pickSubjectPieData('14', data14, dataAll)).toBe(data14)
  })

  it('returns all-time data when period is all', () => {
    expect(pickSubjectPieData('all', data14, dataAll)).toBe(dataAll)
  })
})
