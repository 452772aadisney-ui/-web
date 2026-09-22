'use client'

import { formatClassCourseSeq } from '@/lib/class-course/catalog'
import { CancelAssignmentButton } from '@/components/class-course/CancelAssignmentButton'
import { StudentCourseLineagePanel } from '@/components/class-course/StudentCourseLineagePanel'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

export type StudentCourseUnitRow = {
  courseUnitId: string
  displayName: string
  academicYear: number
  term: string
  subject: string
  track: string
  seqNo: number
  currentStatus: ClassCourseAttendanceStatus
  attended: boolean
  effectiveEventDate: string | null
  events: {
    status: ClassCourseAttendanceStatus
    eventDate: string
    recordedAt: string
    attendanceLineageId: string
    sessionId: string | null
    source: string
  }[]
  lineages: {
    attendanceLineageId: string
    currentStatus: ClassCourseAttendanceStatus
    source: string
    sessionId: string | null
    latestEventDate: string
  }[]
}

function statusLabel(status: ClassCourseAttendanceStatus): string {
  if (status === 'attended') return '実施'
  if (status === 'absent') return '欠席'
  return '未実施'
}

function statusClass(status: ClassCourseAttendanceStatus): string {
  if (status === 'attended') return 'text-emerald-700'
  if (status === 'absent') return 'text-amber-700'
  return 'text-muted'
}

export function StudentCourseGroupTables(props: {
  studentId: string
  todayKey: string
  groups: {
    key: string
    heading: string
    assignedCount: number
    attendedCount: number
    remainingCount: number
    rows: StudentCourseUnitRow[]
  }[]
}) {
  if (props.groups.length === 0) {
    return <p className="text-sm text-muted">割り当てはまだありません。</p>
  }

  return (
    <div className="space-y-6">
      {props.groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div>
            <h3 className="text-base font-bold">{group.heading}</h3>
            <p className="text-sm text-muted">
              割当{group.assignedCount}回／実施{group.attendedCount}回／残り
              {group.remainingCount}回
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">授業番号</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">状態</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">実施日</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.courseUnitId} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {formatClassCourseSeq(row.seqNo)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 ${statusClass(row.currentStatus)}`}>
                      {statusLabel(row.currentStatus)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {row.effectiveEventDate ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[10rem] flex-col gap-1">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary underline">
                            履歴
                          </summary>
                          <div className="mt-2 space-y-2">
                            {row.events.length === 0 ? (
                              <p className="text-muted">履歴はありません。</p>
                            ) : (
                              <ul className="space-y-1 text-muted">
                                {row.events.map((ev, index) => (
                                  <li
                                    key={`${row.courseUnitId}-${ev.recordedAt}-${index}`}
                                  >
                                    {ev.eventDate} · {statusLabel(ev.status)} ·{' '}
                                    {ev.source === 'session'
                                      ? ev.sessionId
                                        ? 'コマ'
                                        : 'コマ（削除済）'
                                      : '手入力'}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <StudentCourseLineagePanel
                              studentId={props.studentId}
                              todayKey={props.todayKey}
                              courseUnitId={row.courseUnitId}
                              displayName={row.displayName}
                              lineages={row.lineages}
                            />
                          </div>
                        </details>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary underline">
                            操作
                          </summary>
                          <div className="mt-2">
                            <CancelAssignmentButton
                              studentId={props.studentId}
                              courseUnitId={row.courseUnitId}
                              disabled={row.currentStatus === 'attended'}
                            />
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
