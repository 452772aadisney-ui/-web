'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addClassScheduleSession,
  cancelClassScheduleDay,
  cancelClassScheduleSession,
  deleteClassScheduleDay,
  deleteClassScheduleSession,
  uncancelClassScheduleDay,
  uncancelClassScheduleSession,
  updateClassScheduleDay,
  updateClassScheduleSession,
  type ClassScheduleActionState,
} from '@/app/class-schedule/actions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH,
  CLASS_SCHEDULE_SUBJECT_MAX_LENGTH,
  CLASS_SCHEDULE_SUBJECT_SUGGESTIONS,
} from '@/lib/class-schedule/validation'
import { resolveLocationDetailsText } from '@/lib/class-schedule/location-details'
import {
  classScheduleFieldClass,
  formatClassScheduleDateLabel,
  formatSessionTimeRange,
} from '@/lib/class-schedule/format'
import { createToastSession } from '@/lib/toast/app-toast'
import { useActionToast } from '@/hooks/useActionToast'
import { SessionTimeRangeFields } from '@/components/class-schedule/SessionTimeRangeFields'
import type { ClassScheduleDayWithSessions, ClassScheduleSession } from '@/types/class-schedule'

const initialState: ClassScheduleActionState = {}

function DayFieldsForm({ day }: { day: ClassScheduleDayWithSessions }) {
  const [state, formAction, pending] = useActionState(updateClassScheduleDay, initialState)
  useActionToast(state, { successMessage: '会場情報を更新しました', pending })
  const locationDefault = resolveLocationDetailsText(day) ?? ''

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <input type="hidden" name="dayId" value={day.id} />
      <h2 className="text-base font-bold">会場・日付</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">日付 *</span>
          <input
            type="date"
            name="scheduleDate"
            required
            defaultValue={day.schedule_date}
            className={classScheduleFieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">会場名 *</span>
          <input
            name="venueName"
            required
            defaultValue={day.venue_name}
            className={classScheduleFieldClass}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">場所の詳細</span>
          <textarea
            name="locationDetails"
            rows={2}
            maxLength={CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH}
            defaultValue={locationDefault}
            className={classScheduleFieldClass}
            placeholder={'例）東京都○○区○○1-2-3　会議室A\nhttps://maps.google.com/...'}
          />
        </label>
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
        aria-label={`${formatClassScheduleDateLabel(day.schedule_date)}の会場情報を更新`}
      >
        {pending ? '保存中…' : '会場情報を保存'}
      </button>
    </form>
  )
}

function SessionEditForm({
  day,
  session,
}: {
  day: ClassScheduleDayWithSessions
  session: ClassScheduleSession
}) {
  const [state, formAction, pending] = useActionState(updateClassScheduleSession, initialState)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionPending, startActionTransition] = useTransition()
  const [startTime, setStartTime] = useState(session.start_time.slice(0, 5))
  const [endTime, setEndTime] = useState(session.end_time.slice(0, 5))
  const dateLabel = formatClassScheduleDateLabel(day.schedule_date)
  const timeLabel = formatSessionTimeRange(session.start_time, session.end_time)
  const dayCancelled = day.status === 'cancelled'

  useActionToast(state, { successMessage: 'コマを更新しました', pending })

  function runConfirmAction(
    action: (formData: FormData) => Promise<ClassScheduleActionState>,
    fields: Record<string, string>,
    onDone: () => void,
  ) {
    startActionTransition(async () => {
      const toast = createToastSession()
      const formData = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        formData.set(key, value)
      }
      const result = await action(formData)
      if (result.success) {
        toast.success(result.successMessage ?? '完了しました')
      } else if (result.error) {
        toast.error(result.error)
      }
      onDone()
    })
  }

  return (
    <li className="space-y-2 rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {timeLabel} <span className="break-words">{session.subject}</span>
          {(dayCancelled || session.status === 'cancelled') && (
            <span className="ml-2 text-xs font-semibold text-red-700">中止</span>
          )}
        </p>
      </div>
      {dayCancelled ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            この日は中止中のため、コマの編集は再開後に行えます。
          </p>
          <button
            type="button"
            disabled={actionPending}
            className="rounded-lg px-3 py-1.5 text-sm text-error hover:underline disabled:opacity-60"
            onClick={() => setConfirmDelete(true)}
            aria-label={`${dateLabel} ${timeLabel} ${session.subject}の誤登録を削除`}
          >
            誤登録を削除
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="sessionId" value={session.id} />
          <input type="hidden" name="dayId" value={day.id} />
          <div className="grid gap-2 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <SessionTimeRangeFields
              startValue={startTime}
              endValue={endTime}
              allowOriginalTimes
              idPrefix={`edit-${session.id}`}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">科目 *</span>
              <input
                name="subject"
                required
                list="class-schedule-subject-suggestions"
                maxLength={CLASS_SCHEDULE_SUBJECT_MAX_LENGTH}
                defaultValue={session.subject}
                className={classScheduleFieldClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">生徒向け補足</span>
            <input
              name="note"
              defaultValue={session.note ?? ''}
              className={classScheduleFieldClass}
            />
          </label>
          {state.error && (
            <p className="text-sm text-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || actionPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-60"
              aria-label={`${dateLabel} ${timeLabel} ${session.subject}を更新`}
            >
              {pending ? '保存中…' : '更新'}
            </button>
            {session.status === 'scheduled' ? (
              <button
                type="button"
                disabled={actionPending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-60"
                onClick={() => setConfirmCancel(true)}
                aria-label={`${dateLabel} ${timeLabel} ${session.subject}を中止`}
              >
                中止
              </button>
            ) : (
              <button
                type="button"
                disabled={actionPending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-60"
                onClick={() =>
                  runConfirmAction(
                    uncancelClassScheduleSession,
                    { sessionId: session.id, dayId: day.id },
                    () => undefined,
                  )
                }
                aria-label={`${dateLabel} ${timeLabel} ${session.subject}を再開`}
              >
                再開
              </button>
            )}
            <button
              type="button"
              disabled={actionPending}
              className="rounded-lg px-3 py-1.5 text-sm text-error hover:underline disabled:opacity-60"
              onClick={() => setConfirmDelete(true)}
              aria-label={`${dateLabel} ${timeLabel} ${session.subject}の誤登録を削除`}
            >
              誤登録を削除
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="このコマを中止しますか？"
        description={`${dateLabel} ${timeLabel} ${session.subject} を中止します。`}
        confirmLabel="中止する"
        busy={actionPending}
        onConfirm={() =>
          runConfirmAction(
            cancelClassScheduleSession,
            { sessionId: session.id, dayId: day.id },
            () => setConfirmCancel(false),
          )
        }
        onCancel={() => {
          if (!actionPending) setConfirmCancel(false)
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="このコマを誤登録として削除しますか？"
        description={`${dateLabel} ${timeLabel} ${session.subject} を履歴から完全に削除します。生徒へ削除通知は送られません。元に戻せません。すでに作成された通知履歴は削除されません。最後の1コマは削除できません。`}
        confirmLabel="削除する"
        busy={actionPending}
        onConfirm={() =>
          runConfirmAction(
            deleteClassScheduleSession,
            { sessionId: session.id, dayId: day.id },
            () => setConfirmDelete(false),
          )
        }
        onCancel={() => {
          if (!actionPending) setConfirmDelete(false)
        }}
      />
    </li>
  )
}

function AddSessionForm({ day }: { day: ClassScheduleDayWithSessions }) {
  const [state, formAction, pending] = useActionState(addClassScheduleSession, initialState)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:30')
  useActionToast(state, { successMessage: 'コマを追加しました', pending })

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <input type="hidden" name="dayId" value={day.id} />
      <h3 className="text-sm font-bold">コマを追加</h3>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <SessionTimeRangeFields
          startValue={startTime}
          endValue={endTime}
          idPrefix={`add-${day.id}`}
          onStartChange={setStartTime}
          onEndChange={setEndTime}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">科目 *</span>
          <input
            name="subject"
            required
            list="class-schedule-subject-suggestions"
            maxLength={CLASS_SCHEDULE_SUBJECT_MAX_LENGTH}
            className={classScheduleFieldClass}
            placeholder="例）英語"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">生徒向け補足</span>
        <input name="note" className={classScheduleFieldClass} />
      </label>
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-60"
        aria-label={`${formatClassScheduleDateLabel(day.schedule_date)}にコマを追加`}
      >
        {pending ? '追加中…' : '追加'}
      </button>
    </form>
  )
}

export function AdminClassScheduleEditPage({ day }: { day: ClassScheduleDayWithSessions }) {
  const router = useRouter()
  const [confirmCancelDay, setConfirmCancelDay] = useState(false)
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(false)
  const [pending, startTransition] = useTransition()
  const dateLabel = formatClassScheduleDateLabel(day.schedule_date)

  function runDayAction(
    action: (formData: FormData) => Promise<ClassScheduleActionState>,
    redirectAfterDelete = false,
  ) {
    startTransition(async () => {
      const toast = createToastSession()
      const formData = new FormData()
      formData.set('dayId', day.id)
      const result = await action(formData)
      if (result.success) {
        setConfirmCancelDay(false)
        setConfirmDeleteDay(false)
        if (redirectAfterDelete) {
          router.push('/admin/class-schedule')
          router.refresh()
          return
        }
        toast.success(result.successMessage ?? '完了しました')
        router.refresh()
      } else if (result.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{dateLabel}</h1>
          <p className="text-sm text-muted">{day.venue_name}</p>
          {day.status === 'cancelled' && (
            <p className="mt-1 text-sm font-semibold text-red-700">この日は中止です</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {day.status === 'scheduled' ? (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => setConfirmCancelDay(true)}
              disabled={pending}
              aria-label={`${dateLabel}の授業を中止`}
            >
              この日を中止
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => runDayAction(uncancelClassScheduleDay)}
              disabled={pending}
              aria-label={`${dateLabel}の授業を再開`}
            >
              この日を再開
            </button>
          )}
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-error hover:underline"
            onClick={() => setConfirmDeleteDay(true)}
            disabled={pending}
            aria-label={`${dateLabel}の誤登録を削除`}
          >
            誤登録を削除
          </button>
        </div>
      </div>

      <DayFieldsForm day={day} />

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">コマ一覧</h2>
        <ul className="space-y-2">
          {day.sessions.map((session) => (
            <SessionEditForm key={session.id} day={day} session={session} />
          ))}
        </ul>
        {day.status === 'scheduled' ? (
          <AddSessionForm day={day} />
        ) : (
          <p className="text-sm text-muted">この日は中止中のため、コマの追加・編集は再開後に行えます。</p>
        )}
        <datalist id="class-schedule-subject-suggestions">
          {CLASS_SCHEDULE_SUBJECT_SUGGESTIONS.map((subject) => (
            <option key={subject} value={subject} />
          ))}
        </datalist>
      </section>

      <ConfirmDialog
        open={confirmCancelDay}
        title="この日の授業を中止しますか？"
        description={`${dateLabel}（${day.venue_name}）を中止します。`}
        confirmLabel="中止する"
        busy={pending}
        onConfirm={() => runDayAction(cancelClassScheduleDay)}
        onCancel={() => {
          if (!pending) setConfirmCancelDay(false)
        }}
      />
      <ConfirmDialog
        open={confirmDeleteDay}
        title="誤登録として削除しますか？"
        description={`${dateLabel}（${day.venue_name}）と紐づくコマをすべて履歴から完全に削除します。生徒へ削除通知は送られません。元に戻せません。すでに作成された通知履歴は削除されません。`}
        confirmLabel="削除する"
        busy={pending}
        onConfirm={() => runDayAction(deleteClassScheduleDay, true)}
        onCancel={() => {
          if (!pending) setConfirmDeleteDay(false)
        }}
      />
    </div>
  )
}
