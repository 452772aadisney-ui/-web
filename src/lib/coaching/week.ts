const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const

export interface WeekDay {
  date: string
  label: string
  weekdayLabel: string
  dayNumber: number
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getWeekStartMonday(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toDateKey(d)
}

export function shiftWeekStart(weekStart: string, weeks: number): string {
  const d = parseDateKey(weekStart)
  d.setDate(d.getDate() + weeks * 7)
  return toDateKey(d)
}

/** 月〜金の5日間（イメージ画像に合わせる） */
export function getWeekdays(weekStartMonday: string): WeekDay[] {
  const start = parseDateKey(weekStartMonday)
  const days: WeekDay[] = []

  for (let i = 0; i < 5; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const jsDay = date.getDay()
    const weekdayIndex = jsDay === 0 ? 6 : jsDay - 1
    days.push({
      date: toDateKey(date),
      label: `${WEEKDAY_LABELS[weekdayIndex]} ${date.getDate()}`,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndex],
      dayNumber: date.getDate(),
    })
  }

  return days
}

export function formatWeekRange(weekStartMonday: string): string {
  const days = getWeekdays(weekStartMonday)
  const first = parseDateKey(days[0].date)
  const last = parseDateKey(days[4].date)
  return `${first.getMonth() + 1}/${first.getDate()} 〜 ${last.getMonth() + 1}/${last.getDate()}`
}

function toWeekDay(date: Date): WeekDay {
  const jsDay = date.getDay()
  const weekdayIndex = jsDay === 0 ? 6 : jsDay - 1
  return {
    date: toDateKey(date),
    label: `${WEEKDAY_LABELS[weekdayIndex]} ${date.getDate()}`,
    weekdayLabel: WEEKDAY_LABELS[weekdayIndex],
    dayNumber: date.getDate(),
  }
}

/** 指定日から連続3日間（生徒向け予約画面） */
export function getThreeDayWindow(startDate: string): WeekDay[] {
  const start = parseDateKey(startDate)
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return toWeekDay(date)
  })
}

export function shiftStartDate(startDate: string, days: number): string {
  const d = parseDateKey(startDate)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function formatDayRange(days: WeekDay[]): string {
  const first = parseDateKey(days[0].date)
  const last = parseDateKey(days[days.length - 1].date)
  return `${first.getMonth() + 1}/${first.getDate()} 〜 ${last.getMonth() + 1}/${last.getDate()}`
}
