'use client'

import { useId, useRef, useState, useTransition } from 'react'
import {
  setStudentNotificationCategoriesBulkAction,
  setStudentNotificationCategoryAction,
} from '@/app/admin/students/notification-actions'
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  NOTIFICATION_PREFERENCE_COPY,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import { createToastSession } from '@/lib/toast/app-toast'
import type { NotificationPreferenceCategory } from '@/types/push'
import { cn } from '@/lib/utils'

type Snapshot = {
  preferences: NotificationPreferencesView
  fromDatabase: boolean
  updatedAt: string | null
  lastChangedByLabel: string | null
  lastChangedAt: string | null
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function AdminStudentNotificationPrefs({
  studentId,
  initialSnapshot,
}: {
  studentId: string
  initialSnapshot: Snapshot
}) {
  const baseId = useId()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [, startTransition] = useTransition()

  const run = (
    work: () => Promise<{ ok: true; snapshot: Snapshot } | { ok: false; error: string }>,
    confirmMessage?: string,
  ) => {
    if (busyRef.current) return
    if (confirmMessage && !window.confirm(confirmMessage)) return

    busyRef.current = true
    setBusy(true)
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await work()
        if (!result.ok) {
          toastSession.error('通知設定を更新できませんでした。もう一度お試しください')
          return
        }
        setSnapshot(result.snapshot)
        toastSession.success('通知設定を更新しました')
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    })
  }

  const setCategory = (category: NotificationPreferenceCategory, enabled: boolean) => {
    const title = NOTIFICATION_PREFERENCE_COPY[category].title
    const reason = !enabled
      ? (window.prompt('停止理由（任意・個人情報は書かないでください）', '') ?? undefined)
      : undefined

    run(
      () =>
        setStudentNotificationCategoryAction({
          studentId,
          category,
          enabled,
          reason,
        }),
      enabled
        ? `「${title}」を有効にします。よろしいですか？`
        : `「${title}」を停止します。Push・メールの両方を送りません。よろしいですか？`,
    )
  }

  const setAll = (enabled: boolean) => {
    const reason = !enabled
      ? (window.prompt('一括停止の理由（任意・個人情報は書かないでください）', '') ?? undefined)
      : undefined

    run(
      () =>
        setStudentNotificationCategoriesBulkAction({
          studentId,
          enabled,
          reason,
        }),
      enabled
        ? 'この生徒の通知をすべて有効にします。よろしいですか？'
        : 'この生徒の通知をすべて停止します。Push・メールの両方を送りません。よろしいですか？',
    )
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-labelledby={`${baseId}-heading`}
      aria-busy={busy}
    >
      <h2 id={`${baseId}-heading`} className="text-base font-bold text-foreground">
        通知設定
      </h2>
      <p className="mt-2 text-sm text-muted">
        有効時は Web 通知を優先し、利用できない場合はメールへ送ります。停止中は両方送りません。生徒本人はカテゴリを変更できません。
      </p>

      <ul className="mt-4 divide-y divide-border">
        {NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => {
          const copy = NOTIFICATION_PREFERENCE_COPY[category]
          const enabled = snapshot.preferences[category]
          return (
            <li
              key={category}
              className="flex flex-col gap-2 py-4 first:pt-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{copy.title}</p>
                <p className="mt-1 text-sm text-muted">{copy.description}</p>
                <p
                  className={cn(
                    'mt-1 text-sm font-medium',
                    enabled ? 'text-foreground' : 'text-amber-800',
                  )}
                >
                  {enabled ? '有効（Push優先・不可時メール）' : '停止中（Push・メールなし）'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || enabled}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => setCategory(category, true)}
                >
                  有効にする
                </button>
                <button
                  type="button"
                  disabled={busy || !enabled}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
                  onClick={() => setCategory(category, false)}
                >
                  停止する
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          onClick={() => setAll(true)}
        >
          すべて有効にする
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 disabled:opacity-60"
          onClick={() => setAll(false)}
        >
          すべて停止する
        </button>
      </div>

      <dl className="mt-4 grid gap-1 text-xs text-muted">
        <div>最終更新: {formatTs(snapshot.updatedAt)}</div>
        <div>
          直近の管理者変更:{' '}
          {snapshot.lastChangedAt
            ? `${formatTs(snapshot.lastChangedAt)}${
                snapshot.lastChangedByLabel ? `（${snapshot.lastChangedByLabel}）` : ''
              }`
            : '—'}
        </div>
        {!snapshot.fromDatabase ? (
          <div>設定行未作成（送信時は全項目ON扱い）。変更すると作成されます。</div>
        ) : null}
      </dl>
    </section>
  )
}
