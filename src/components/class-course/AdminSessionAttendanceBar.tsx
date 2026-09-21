'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  previewBulkMarkAttended,
  recordClassCourseAttendance,
  recordClassCourseAttendanceForAllAttendees,
  removeSessionAttendee,
} from '@/app/class-course/attendance-actions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkPreview, setBulkPreview] = useState<{
    toSaveCount: number
    absentLabels: string[]
    alreadyAttendedCount: number
  } | null>(null)

  if (props.attendees.length === 0) return null

  const courseUnitId = props.attendees[0]!.courseUnitId
  const blockedNew =
    props.dayCancelled || props.sessionCancelled || !props.canRecord

  function save(
    studentId: string,
    unitId: string,
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
        courseUnitId: unitId,
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
      setMessage(result.skipped ? (result.message ?? 'すでに実施済みです') : '保存しました')
      router.refresh()
    })
  }

  function openBulkConfirm() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const preview = await previewBulkMarkAttended({
        sessionId: props.sessionId,
        courseUnitId,
      })
      if (!preview.ok) {
        setError(preview.error)
        return
      }
      setBulkPreview(preview)
      setConfirmBulk(true)
    })
  }

  function runBulk() {
    startTransition(async () => {
      const result = await recordClassCourseAttendanceForAllAttendees({
        sessionId: props.sessionId,
        courseUnitId,
        eventDate: props.eventDate,
      })
      setConfirmBulk(false)
      setBulkPreview(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(result.message)
      router.refresh()
    })
  }

  function removeAttendee(studentId: string, unitId: string) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await removeSessionAttendee({
        sessionId: props.sessionId,
        studentId,
        courseUnitId: unitId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('対象から外しました（割当は残ります）')
      router.refresh()
    })
  }

  const bulkDescription = bulkPreview
    ? [
        `${bulkPreview.toSaveCount}名を実施にします。`,
        bulkPreview.absentLabels.length > 0
          ? `欠席から実施へ訂正: ${bulkPreview.absentLabels.join('、')}`
          : null,
        bulkPreview.alreadyAttendedCount > 0
          ? `実施済みスキップ: ${bulkPreview.alreadyAttendedCount}名`
          : null,
        '実施済みは二重消化しません。履歴は個別操作と同様に追記されます。',
      ]
        .filter(Boolean)
        .join('\n')
    : '対象者全員を実施にします。'

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted">実施状況</p>
        <button
          type="button"
          disabled={pending || blockedNew}
          className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
          onClick={openBulkConfirm}
        >
          対象者全員を実施にする
        </button>
      </div>
      <ul className="space-y-2">
        {props.attendees.map((row) => (
          <li
            key={row.studentId}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <Link
                href={`/admin/class-schedule/students/${row.studentId}`}
                className="text-primary underline"
              >
                {row.label}
              </Link>
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
              <button
                type="button"
                disabled={pending}
                className="rounded px-2 py-1 text-xs text-error hover:underline disabled:opacity-50"
                onClick={() => removeAttendee(row.studentId, row.courseUnitId)}
              >
                対象外
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-red-600 whitespace-pre-wrap">{error}</p> : null}
      {message ? <p className="text-xs text-muted whitespace-pre-wrap">{message}</p> : null}

      <ConfirmDialog
        open={confirmBulk}
        title="対象者全員を実施にしますか？"
        description={bulkDescription}
        confirmLabel="全員を実施にする"
        busy={pending}
        onConfirm={runBulk}
        onCancel={() => {
          if (!pending) {
            setConfirmBulk(false)
            setBulkPreview(null)
          }
        }}
      />
    </div>
  )
}
