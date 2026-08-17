import type { StudentQuizResultRow } from '@/types/quiz'

export type QuizScoreTrendPoint = {
  dateKey: string
  label: string
  title: string
  subject: string
  score: number
  maxScore: number
  percentage: number
}

function formatQuizDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function buildQuizScoreTrendData(
  rows: StudentQuizResultRow[],
): QuizScoreTrendPoint[] {
  return [...rows]
    .sort((a, b) => a.assignment.scheduled_on.localeCompare(b.assignment.scheduled_on))
    .map((row) => ({
      dateKey: row.assignment.scheduled_on,
      label: formatQuizDateLabel(row.assignment.scheduled_on),
      title: row.master.title,
      subject: row.master.subject,
      score: Number(row.result.score),
      maxScore: row.result.max_score,
      percentage: Math.round((Number(row.result.score) / row.result.max_score) * 1000) / 10,
    }))
}

export function formatQuizScore(score: number, maxScore: number): string {
  const percentage = Math.round((score / maxScore) * 1000) / 10
  return `${score} / ${maxScore}（${percentage}%）`
}
