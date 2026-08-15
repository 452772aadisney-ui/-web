export interface StudyLog {
  id: string
  student_id: string
  subject: string
  textbook_id: string | null
  textbook_name: string
  content: string
  duration_minutes: number
  studied_on: string
  created_at: string
  updated_at: string
}

export interface DailyChartRow {
  date: string
  label: string
  [subject: string]: string | number
}

export interface SubjectChartRow {
  name: string
  value: number
  minutes: number
}

export const SUBJECT_CHART_COLORS: Record<string, string> = {
  国語: '#2563eb',
  現代文: '#2563eb',
  古文: '#3b82f6',
  漢文: '#60a5fa',
  数学: '#dc2626',
  数学IA: '#dc2626',
  数学IIBC: '#ef4444',
  数学III: '#f87171',
  英語: '#16a34a',
  物理: '#9333ea',
  物理基礎: '#a855f7',
  化学: '#ea580c',
  化学基礎: '#fb923c',
  生物: '#0891b2',
  生物基礎: '#22d3ee',
  地学: '#4f46e5',
  地学基礎: '#6366f1',
  日本史: '#b45309',
  世界史: '#be185d',
  地理: '#0d9488',
  '古文/漢文': '#3b82f6',
  '公共/倫理/政治経済': '#64748b',
  公民: '#64748b',
  倫理: '#64748b',
  政治経済: '#78716c',
  情報: '#0284c7',
  小論文: '#7c3aed',
  その他: '#94a3b8',
}

export const DEFAULT_CHART_COLOR = '#94a3b8'

export function getSubjectColor(subject: string): string {
  return SUBJECT_CHART_COLORS[subject] ?? DEFAULT_CHART_COLOR
}

import { formatChartDate, getRecentDateKeys, getTodayDateKey } from '@/lib/study/dates'

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

export function buildDailyChartData(logs: StudyLog[], days = 14): {
  rows: DailyChartRow[]
  subjects: string[]
} {
  const dateKeys = getRecentDateKeys(days)
  const todayKey = getTodayDateKey()
  const subjectSet = new Set<string>()

  const totals = new Map<string, Map<string, number>>()
  for (const key of dateKeys) {
    totals.set(key, new Map())
  }

  for (const log of logs) {
    if (!dateKeys.includes(log.studied_on)) continue
    subjectSet.add(log.subject)
    const dayMap = totals.get(log.studied_on)!
    dayMap.set(log.subject, (dayMap.get(log.subject) ?? 0) + log.duration_minutes)
  }

  const subjects = Array.from(subjectSet).sort()

  const rows: DailyChartRow[] = dateKeys.map((date) => {
    const row: DailyChartRow = {
      date,
      label: formatChartDate(date, date === todayKey),
    }
    const dayMap = totals.get(date)!
    for (const subject of subjects) {
      row[subject] = dayMap.get(subject) ?? 0
    }
    return row
  })

  return { rows, subjects }
}

export function buildSubjectPieData(logs: StudyLog[]): SubjectChartRow[] {
  const totals = new Map<string, number>()

  for (const log of logs) {
    totals.set(log.subject, (totals.get(log.subject) ?? 0) + log.duration_minutes)
  }

  return Array.from(totals.entries())
    .map(([name, minutes]) => ({
      name,
      value: minutes,
      minutes,
    }))
    .sort((a, b) => b.value - a.value)
}
