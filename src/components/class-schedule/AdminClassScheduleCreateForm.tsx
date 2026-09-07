'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createClassScheduleDay,
  type ClassScheduleActionState,
} from '@/app/class-schedule/actions'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { classScheduleFieldClass } from '@/lib/class-schedule/format'
import { useActionToast } from '@/hooks/useActionToast'

const initialState: ClassScheduleActionState = {}

type SessionRow = {
  key: string
  startTime: string
  endTime: string
  subject: string
  note: string
}

function newSessionRow(): SessionRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startTime: '10:00',
    endTime: '11:30',
    subject: EXAM_SUBJECTS[0],
    note: '',
  }
}

export function AdminClassScheduleCreateForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    async (prev: ClassScheduleActionState, formData: FormData) => {
      const result = await createClassScheduleDay(prev, formData)
      if (result.success) {
        // Success toast is shown on the list via one-shot flash cookie.
        router.push('/admin/class-schedule')
        router.refresh()
      }
      return result
    },
    initialState,
  )
  const [sessions, setSessions] = useState<SessionRow[]>([newSessionRow()])

  useActionToast(state, {
    successMessage: '授業予定を登録しました',
    showSuccess: false,
    pending,
  })

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">日付 *</span>
          <input
            type="date"
            name="scheduleDate"
            required
            className={classScheduleFieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">会場名 *</span>
          <input name="venueName" required className={classScheduleFieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">住所</span>
          <input name="address" className={classScheduleFieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">地図URL（https）</span>
          <input
            name="mapUrl"
            type="url"
            placeholder="https://"
            className={classScheduleFieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">教室・階などのメモ</span>
          <input name="roomNote" className={classScheduleFieldClass} />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">コマ</h2>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setSessions((prev) => [...prev, newSessionRow()])}
          >
            コマを追加
          </button>
        </div>

        <ul className="space-y-3">
          {sessions.map((session, index) => (
            <li
              key={session.key}
              className="space-y-3 rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{index + 1}コマ目</p>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-error hover:underline"
                    onClick={() =>
                      setSessions((prev) => prev.filter((row) => row.key !== session.key))
                    }
                    aria-label={`${index + 1}コマ目を削除`}
                  >
                    削除
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">開始 *</span>
                  <input
                    type="time"
                    name="sessionStartTime"
                    required
                    value={session.startTime}
                    onChange={(event) =>
                      setSessions((prev) =>
                        prev.map((row) =>
                          row.key === session.key
                            ? { ...row, startTime: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className={classScheduleFieldClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">終了 *</span>
                  <input
                    type="time"
                    name="sessionEndTime"
                    required
                    value={session.endTime}
                    onChange={(event) =>
                      setSessions((prev) =>
                        prev.map((row) =>
                          row.key === session.key
                            ? { ...row, endTime: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className={classScheduleFieldClass}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium">科目 *</span>
                  <select
                    name="sessionSubject"
                    required
                    value={session.subject}
                    onChange={(event) =>
                      setSessions((prev) =>
                        prev.map((row) =>
                          row.key === session.key
                            ? { ...row, subject: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className={classScheduleFieldClass}
                  >
                    {EXAM_SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium">生徒向けメモ</span>
                  <input
                    name="sessionNote"
                    value={session.note}
                    onChange={(event) =>
                      setSessions((prev) =>
                        prev.map((row) =>
                          row.key === session.key
                            ? { ...row, note: event.target.value }
                            : row,
                        ),
                      )
                    }
                    className={classScheduleFieldClass}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : '登録する'}
      </button>
    </form>
  )
}
