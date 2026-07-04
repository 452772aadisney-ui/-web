import type { ExamScheduleType } from '@/types/schedule'

export type CalendarEventType =
  | 'mock_exam'
  | 'quiz'
  | 'homework'
  | 'textbook_start'
  | 'textbook_end'

export interface CalendarEvent {
  id: string
  date: string
  type: CalendarEventType
  title: string
  subject?: string
  detail?: string
}

export const CALENDAR_EVENT_LABELS: Record<CalendarEventType, string> = {
  mock_exam: '模試',
  quiz: '小テスト',
  homework: '宿題・タスク',
  textbook_start: '参考書開始',
  textbook_end: '参考書終了予定',
}

export const CALENDAR_EVENT_COLORS: Record<CalendarEventType, string> = {
  mock_exam: 'bg-red-500',
  quiz: 'bg-orange-500',
  homework: 'bg-blue-500',
  textbook_start: 'bg-emerald-500',
  textbook_end: 'bg-purple-500',
}

export const EXAM_TYPE_LABELS: Record<ExamScheduleType, string> = {
  mock_exam: '模試',
  quiz: '小テスト',
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const list = map.get(event.date) ?? []
    list.push(event)
    map.set(event.date, list)
  }
  return map
}

export function getEventDates(events: CalendarEvent[]): Date[] {
  return events.map((e) => {
    const [y, m, d] = e.date.split('-').map(Number)
    return new Date(y, m - 1, d)
  })
}
