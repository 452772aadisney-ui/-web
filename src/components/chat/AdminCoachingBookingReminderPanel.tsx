'use client'

import { useActionState, type FormEvent } from 'react'
import { sendCoachingBookingReminders, type ChatBulkReminderState } from '@/app/chat/actions'

const initialState: ChatBulkReminderState = {}
const fieldClass =
  'block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface AdminCoachingBookingReminderPanelProps {
  weekLabel: string
  targetCount: number
  defaultMessage: string
}

export function AdminCoachingBookingReminderPanel({
  weekLabel,
  targetCount,
  defaultMessage,
}: AdminCoachingBookingReminderPanelProps) {
  const [state, formAction, pending] = useActionState(sendCoachingBookingReminders, initialState)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (targetCount === 0) return

    const formData = new FormData(event.currentTarget)

    if (
      !window.confirm(
        `今週（${weekLabel}）未予約の ${targetCount} 名に、予約を促すメッセージを送信します。よろしいですか？`,
      )
    ) {
      return
    }

    formAction(formData)
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
      <h2 className="text-base font-bold">コーチング予約の催促</h2>
      <p className="mt-1 text-sm text-muted">
        今週（{weekLabel}）未予約の生徒 {targetCount} 名に、一括でメッセージを送れます。
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">送信メッセージ</span>
          <textarea
            name="body"
            rows={4}
            defaultValue={defaultMessage}
            className={fieldClass}
          />
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {state.sentCount} 名に送信しました
            {state.failedCount ? `（${state.failedCount} 名は失敗）` : ''}。
          </p>
        )}

        <button
          type="submit"
          disabled={pending || targetCount === 0}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending
            ? '送信中…'
            : targetCount === 0
              ? '送信対象の生徒がいません'
              : `${targetCount} 名に予約催促を送信`}
        </button>
      </form>
    </section>
  )
}
