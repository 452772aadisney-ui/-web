import type { SubjectChartRow } from '@/lib/study/chart-data'

export type SubjectPiePeriod = '14' | 'all'

export function pickSubjectPieData(
  period: SubjectPiePeriod,
  data14: SubjectChartRow[],
  dataAll: SubjectChartRow[],
): SubjectChartRow[] {
  return period === '14' ? data14 : dataAll
}
