import { formatDuration } from '@/lib/study/chart-data'

/** Subtitle for the primary study-log button on the student mypage. */
export function formatTodayStudyButtonSubtitle(todayMinutes: number): {
  text: string
  tone: 'empty' | 'recorded'
} {
  if (todayMinutes <= 0) {
    return {
      text: '今日はまだ学習記録がありません',
      tone: 'empty',
    }
  }

  return {
    text: `今日の記録：${formatDuration(todayMinutes)}`,
    tone: 'recorded',
  }
}
