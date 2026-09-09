import { describe, expect, it } from 'vitest'
import {
  buildSubjectPieDataFromMinutes,
  sumScienceFamilyMinutesFromChartRows,
} from '@/lib/study/chart-data'

describe('science family chart aggregation', () => {
  it('counts each minute once across legacy 理科 and the four subjects', () => {
    const pie = buildSubjectPieDataFromMinutes([
      { subject: '理科', minutes: 10 },
      { subject: '物理', minutes: 20 },
      { subject: '化学基礎', minutes: 5 },
      { subject: '数学IA', minutes: 100 },
    ])

    expect(pie.map((row) => row.name).sort()).toEqual(['化学', '数学', '物理', '理科'].sort())
    expect(sumScienceFamilyMinutesFromChartRows(pie)).toBe(35)
  })
})
