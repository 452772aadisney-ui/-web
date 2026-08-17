import { formatQuizScore } from '@/lib/quizzes/chart-data'
import type { StudentQuizResultRow } from '@/types/quiz'

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

export function StudentQuizScoreHistory({ rows }: { rows: StudentQuizResultRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted">
        記録された小テストの点数はまだありません。
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-background">
          <tr className="border-b border-border text-muted">
            <th className="px-4 py-3 font-medium">実施日</th>
            <th className="px-4 py-3 font-medium">小テスト</th>
            <th className="px-4 py-3 font-medium">教科</th>
            <th className="px-4 py-3 font-medium">点数</th>
            <th className="px-4 py-3 font-medium">メモ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ result, assignment, master }) => (
            <tr key={result.id}>
              <td className="px-4 py-3 text-muted">{formatDate(assignment.scheduled_on)}</td>
              <td className="px-4 py-3 font-medium">{master.title}</td>
              <td className="px-4 py-3 text-muted">{master.subject || '—'}</td>
              <td className="px-4 py-3">
                {formatQuizScore(Number(result.score), result.max_score)}
              </td>
              <td className="px-4 py-3 text-muted">{result.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
