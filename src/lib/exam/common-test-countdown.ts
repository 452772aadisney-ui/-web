import { shiftDateKey } from '@/lib/study/dates'

/** 共通テスト本試験1日目（大学入試センター公表日程。年度更新時に追加） */
const COMMON_TEST_FIRST_DAYS = [
  '2026-01-18',
  '2027-01-16',
  '2028-01-15',
  '2029-01-13',
  '2030-01-12',
] as const

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  let current = fromKey
  let days = 0
  while (current < toKey) {
    current = shiftDateKey(current, 1)
    days++
  }
  return days
}

/** 指定日（JST YYYY-MM-DD）から次の共通テスト1日目までの日数。当日は 0。 */
export function getDaysUntilCommonTest(todayKey: string): number | null {
  const target = COMMON_TEST_FIRST_DAYS.find((dateKey) => dateKey >= todayKey)
  if (!target) return null
  return daysBetweenDateKeys(todayKey, target)
}
