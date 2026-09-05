'use client'

import { useActionState, useState, type FormEvent } from 'react'
import { sendCoachingBookingReminders, type ChatBulkReminderState } from '@/app/chat/actions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useActionToast } from '@/hooks/useActionToast'

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)

  const successMessage =
    typeof state.sentCount === 'number'
      ? `${state.sentCount} 名に送信しました${
          state.failedCount ? `（${state.failedCount} 名は失敗）` : ''
        }`
      : '送信しました'

  useActionToast(state, {
    successMessage,
    pending,
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (targetCount === 0) return

    setPendingFormData(new FormData(event.currentTarget))
    setConfirmOpen(true)
  }

  function handleConfirm() {
    if (!pendingFormData) return
    setConfirmOpen(false)
    formAction(pendingFormData)
    setPendingFormData(null)
  }

  function handleCancel() {
    if (pending) return
    setConfirmOpen(false)
    setPendingFormData(null)
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
      <h2 className="text-base font-bold">コーチング予約の催促（チャット一括送信）</h2>
      <p className="mt-1 text-sm text-muted">
        今週（{weekLabel}）未予約の生徒 {targetCount}{' '}
        名に、チャットメッセージを一括送信します。Web Push の Cron
        催促とは別経路です（こちらは手動のチャット催促）。
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error" role="alert">
            {state.error}
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

      <ConfirmDialog
        open={confirmOpen}
        title="チャットで予約催促を送信しますか？"
        description={`今週（${weekLabel}）未予約の ${targetCount} 名に、予約を促すチャットメッセージを送信します。\n※ Push 通知の自動 Cron とは別の、緊急時向け手動操作です。`}
        confirmLabel={`${targetCount} 名に送信`}
        cancelLabel="やめる"
        busy={pending}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </section>
  )
}
