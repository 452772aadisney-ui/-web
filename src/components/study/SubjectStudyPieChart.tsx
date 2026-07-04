'use client'

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import {
  type SubjectChartRow,
  formatDuration,
  getSubjectColor,
} from '@/lib/study/chart-data'

interface SubjectStudyPieChartProps {
  data: SubjectChartRow[]
}

export function SubjectStudyPieChart({ data }: SubjectStudyPieChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        科目別のデータがまだありません。
      </p>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={getSubjectColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatDuration(Number(value ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
