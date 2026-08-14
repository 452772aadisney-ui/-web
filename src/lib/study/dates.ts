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

/** 日本時間（JST）の YYYY-MM-DD */
export function getJstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toLocalDateKey(date)
}

export function formatStudyDateLabel(dateKey: string, todayKey: string): string {
  const yesterdayKey = shiftDateKey(todayKey, -1)
  if (dateKey === todayKey) return '今日'
  if (dateKey === yesterdayKey) return '昨日'

  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).toLocaleDateString('ja-JP', {
    weekday: 'short',
  })
  return `${Number(month)}月${Number(day)}日（${weekday}）`
}

export function isValidDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}
