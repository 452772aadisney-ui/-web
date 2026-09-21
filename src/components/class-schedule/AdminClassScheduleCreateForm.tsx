'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createClassScheduleDay,
  type ClassScheduleActionState,
} from '@/app/class-schedule/actions'
import {
  CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH,
  CLASS_SCHEDULE_SUBJECT_SUGGESTIONS,
} from '@/lib/class-schedule/validation'
import { classScheduleFieldClass } from '@/lib/class-schedule/format'
import { useActionToast } from '@/hooks/useActionToast'
import { SessionTimeRangeFields } from '@/components/class-schedule/SessionTimeRangeFields'
import {
  CourseLinkedSessionFields,
  defaultCourseSessionDraft,
  type CourseSessionDraft,
} from '@/components/class-course/CourseLinkedSessionFields'
import { resolveAcademicYearFromJstDateKey } from '@/lib/class-course/catalog'
import { getJstDateKey } from '@/lib/study/dates'

const initialState: ClassScheduleActionState = {}

type SessionRow = CourseSessionDraft & { key: string }

function newSessionRow(): SessionRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...defaultCourseSessionDraft(getJstDateKey()),
  }
}

export function AdminClassScheduleCreateForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    async (prev: ClassScheduleActionState, formData: FormData) => {
      const result = await createClassScheduleDay(prev, formData)
      if (result.success) {
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
    <form action={formAction} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">日付 *</span>
          <input
            type="date"
            name="scheduleDate"
            required
            className={classScheduleFieldClass}
            onChange={(e) => {
              const key = e.target.value
              if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return
              const year = resolveAcademicYearFromJstDateKey(key)
              setSessions((prev) =>
                prev.map((row) =>
                  row.mode === 'course' ? { ...row, academicYear: year } : row,
                ),
              )
            }}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">会場名 *</span>
          <input name="venueName" required className={classScheduleFieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">場所の詳細</span>
          <textarea
            name="locationDetails"
            rows={2}
            maxLength={CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH}
            placeholder={'例）東京都○○区○○1-2-3　会議室A\nhttps://maps.google.com/...'}
            className={classScheduleFieldClass}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">コマ</h2>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setSessions((prev) => [...prev, newSessionRow()])}
          >
            コマを追加
          </button>
        </div>

        <ul className="space-y-2">
          {sessions.map((session, index) => (
            <li
              key={session.key}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted">{index + 1}コマ目</p>
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
              <div className="mb-3">
                <SessionTimeRangeFields
                  startName="sessionStartTime"
                  endName="sessionEndTime"
                  startValue={session.startTime}
                  endValue={session.endTime}
                  idPrefix={`create-${session.key}`}
                  onStartChange={(value) =>
                    setSessions((prev) =>
                      prev.map((row) =>
                        row.key === session.key ? { ...row, startTime: value } : row,
                      ),
                    )
                  }
                  onEndChange={(value) =>
                    setSessions((prev) =>
                      prev.map((row) =>
                        row.key === session.key ? { ...row, endTime: value } : row,
                      ),
                    )
                  }
                />
              </div>
              <CourseLinkedSessionFields
                index={index}
                value={session}
                onChange={(next) =>
                  setSessions((prev) =>
                    prev.map((row) =>
                      row.key === session.key ? { ...row, ...next } : row,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <datalist id="class-schedule-subject-suggestions">
          {CLASS_SCHEDULE_SUBJECT_SUGGESTIONS.map((subject) => (
            <option key={subject} value={subject} />
          ))}
        </datalist>
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
