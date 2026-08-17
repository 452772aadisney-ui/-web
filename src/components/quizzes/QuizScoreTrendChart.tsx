'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { QuizScoreTrendPoint } from '@/lib/quizzes/chart-data'

interface QuizScoreTrendChartProps {
  data: QuizScoreTrendPoint[]
}

export function QuizScoreTrendChart({ data }: QuizScoreTrendChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        まだ点数が記録されていません。
      </p>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
          <YAxis
            domain={[0, 100]}
            width={36}
            tick={{ fontSize: 12 }}
            stroke="#64748b"
            label={{
              value: '%',
              angle: -90,
              position: 'insideTopLeft',
              offset: 0,
              style: { fontSize: 11, fill: '#64748b' },
            }}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, '得点率']}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as QuizScoreTrendPoint | undefined
              if (!row) return ''
              return `${row.label} ${row.title}`
            }}
          />
          <Line
            type="monotone"
            dataKey="percentage"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
