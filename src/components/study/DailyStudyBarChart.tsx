'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type DailyChartRow,
  formatDuration,
  getSubjectColor,
} from '@/lib/study/chart-data'

interface DailyStudyBarChartProps {
  data: DailyChartRow[]
  subjects: string[]
}

export function DailyStudyBarChart({ data, subjects }: DailyStudyBarChartProps) {
  const hasData = data.some((row) =>
    subjects.some((subject) => Number(row[subject] ?? 0) > 0),
  )

  if (!hasData) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        まだ学習記録がありません。記録を追加するとグラフが表示されます。
      </p>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#64748b" />
          <YAxis
            width={72}
            tick={{ fontSize: 11 }}
            stroke="#64748b"
            tickFormatter={(value) => formatDuration(Number(value))}
          />
          <Tooltip
            formatter={(value, name) => [
              formatDuration(Number(value ?? 0)),
              String(name),
            ]}
            labelFormatter={(label) => `${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {subjects.map((subject) => (
            <Bar
              key={subject}
              dataKey={subject}
              stackId="study"
              fill={getSubjectColor(subject)}
              radius={subject === subjects[subjects.length - 1] ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
