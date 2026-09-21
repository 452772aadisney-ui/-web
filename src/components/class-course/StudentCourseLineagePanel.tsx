'use client'

import { useState } from 'react'
import { ManualAttendanceForm } from '@/components/class-course/ManualAttendanceForm'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

function statusLabel(status: ClassCourseAttendanceStatus): string {
  if (status === 'attended') return '実施'
  if (status === 'absent') return '欠席'
  return '未実施'
}

export function StudentCourseLineagePanel(props: {
  studentId: string
  todayKey: string
  courseUnitId: string
  displayName: string
  lineages: {
    attendanceLineageId: string
    currentStatus: ClassCourseAttendanceStatus
    source: string
    sessionId: string | null
    latestEventDate: string
  }[]
}) {
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const correcting = props.lineages.find((l) => l.attendanceLineageId === correctingId)

  return (
    <div className="mt-2 space-y-2">
      {props.lineages.length === 0 ? null : (
        <ul className="space-y-1 text-xs text-muted">
          {props.lineages.map((lineage) => {
            const kind =
              lineage.source === 'session'
                ? lineage.sessionId
                  ? 'コマ'
                  : 'コマ（削除済）'
                : '手入力'
            return (
              <li
                key={lineage.attendanceLineageId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {lineage.latestEventDate} · {kind} · 現在{' '}
                  {statusLabel(lineage.currentStatus)}
                </span>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => setCorrectingId(lineage.attendanceLineageId)}
                >
                  この記録を訂正
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {correcting ? (
        <div className="rounded border border-border p-2">
          <ManualAttendanceForm
            studentId={props.studentId}
            todayKey={props.todayKey}
            units={[{ id: props.courseUnitId, label: props.displayName }]}
            correctLineage={{
              courseUnitId: props.courseUnitId,
              attendanceLineageId: correcting.attendanceLineageId,
              label: `${props.displayName} / ${correcting.latestEventDate}（${
                correcting.source === 'session'
                  ? correcting.sessionId
                    ? 'コマ'
                    : 'コマ削除後'
                  : '手入力'
              }）`,
            }}
          />
          <button
            type="button"
            className="mt-2 text-xs text-muted underline"
            onClick={() => setCorrectingId(null)}
          >
            訂正を閉じる
          </button>
        </div>
      ) : null}
    </div>
  )
}
