/** ローカルタイムゾーンの YYYY-MM-DD */
export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 直近 N 日分の日付キー（今日を含む） */
export function getRecentDateKeys(days: number): string[] {
  const keys: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    keys.push(toLocalDateKey(d))
  }

  return keys
}

export function formatChartDate(dateKey: string, isToday = false): string {
  if (isToday) return '今日'
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function getTodayDateKey(): string {
  return toLocalDateKey(new Date())
}
