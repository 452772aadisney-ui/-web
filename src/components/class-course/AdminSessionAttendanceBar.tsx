'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordClassCourseAttendance } from '@/app/class-course/attendance-actions'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

export type SessionAttendeeRow = {
  studentId: string
  label: string
  courseUnitId: string
  currentStatus: ClassCourseAttendanceStatus
}

export function AdminSessionAttendanceBar(props: {
  sessionId: string
  eventDate: string
  dayCancelled: boolean
  sessionCancelled: boolean
  canRecord: boolean
  attendees: SessionAttendeeRow[]
}) {
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (props.attendees.length === 0) return null

  const blockedNew =
    props.dayCancelled || props.sessionCancelled || !props.canRecord

  function save(
    studentId: string,
    courseUnitId: string,
    status: ClassCourseAttendanceStatus,
  ) {
    if (blockedNew && status !== 'not_done') {
      setError(
        props.dayCancelled || props.sessionCancelled
          ? '中止コマには新規の実施・欠席を付けられません（未実施への訂正のみ可）'
          : '未来日の実施・欠席は登録できません',
      )
      return
    }
    const key = `${studentId}:${status}`
    setPendingKey(key)
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await recordClassCourseAttendance({
        courseUnitId,
        studentId,
        status,
        eventDate: props.eventDate,
        sessionId: props.sessionId,
      })
      setPendingKey(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('保存しました')
      router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold text-muted">実施状況</p>
      <ul className="space-y-2">
        {props.attendees.map((row) => (
          <li
            key={row.studentId}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {row.label}
              <span className="ml-2 text-xs text-muted">
                (
                {row.currentStatus === 'attended'
                  ? '実施'
                  : row.currentStatus === 'absent'
                    ? '欠席'
                    : '未実施'}
                )
              </span>
            </span>
            <span className="flex flex-wrap gap-1">
              {(
                [
                  ['attended', '実施'],
                  ['not_done', '未実施'],
                  ['absent', '欠席'],
                ] as const
              ).map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  disabled={pending}
                  className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                  onClick={() => save(row.studentId, row.courseUnitId, status)}
                >
                  {pendingKey === `${row.studentId}:${status}` ? '…' : label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  )
}
