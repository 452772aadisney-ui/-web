'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recordClassCourseAttendance } from '@/app/class-course/attendance-actions'
import type { ClassCourseAttendanceStatus } from '@/types/class-course'

export function ManualAttendanceForm(props: {
  studentId: string
  todayKey: string
  units: { id: string; label: string }[]
  /** When set, corrects an existing lineage (manual or post-delete session). */
  correctLineage?: {
    courseUnitId: string
    attendanceLineageId: string
    label: string
  } | null
}) {
  const router = useRouter()
  const correcting = props.correctLineage ?? null
  const [unitId, setUnitId] = useState(
    correcting?.courseUnitId ?? props.units[0]?.id ?? '',
  )
  const [eventDate, setEventDate] = useState(props.todayKey)
  const [status, setStatus] = useState<ClassCourseAttendanceStatus>(
    correcting ? 'not_done' : 'attended',
  )
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (props.units.length === 0 && !correcting) {
    return <p className="text-sm text-muted">手入力できる割当がありません。</p>
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setMessage(null)
        startTransition(async () => {
          const result = await recordClassCourseAttendance({
            courseUnitId: correcting?.courseUnitId ?? unitId,
            studentId: props.studentId,
            status,
            eventDate,
            attendanceLineageId: correcting?.attendanceLineageId ?? null,
          })
          if (!result.ok) {
            setError(result.error)
            return
          }
          setMessage(
            result.skipped
              ? (result.message ?? 'すでに実施済みです')
              : '保存しました',
          )
          router.refresh()
        })
      }}
    >
      {correcting ? (
        <p className="text-sm text-muted">訂正対象: {correcting.label}</p>
      ) : (
        <label className="block text-sm">
          <span className="font-medium">授業</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {props.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium">実施日</span>
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={eventDate}
          max={props.todayKey}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">状態</span>
        <select
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value as ClassCourseAttendanceStatus)}
        >
          <option value="attended">実施</option>
          <option value="absent">欠席</option>
          <option value="not_done">未実施</option>
        </select>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '保存中…' : correcting ? 'この記録を訂正' : '保存'}
      </button>
    </form>
  )
}
