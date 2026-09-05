'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { createToastSession } from '@/lib/toast/app-toast'
import type { AdminTestInspectResult, AdminTestTargetOption } from '@/lib/admin/notification-test-service'

type Props = {
  initialFeatureAvailable: boolean
  initialDisabledReason: string | null
  initialTargets: AdminTestTargetOption[]
}

type ApiInspectResponse = { ok: true; inspect: AdminTestInspectResult }

async function postAction(
  action: 'inspect' | 'push' | 'email',
  targetUserId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string; retryAfterSeconds?: number }> {
  try {
    const response = await fetch('/api/admin/notification-test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, targetUserId }),
      cache: 'no-store',
    })

    let payload: { error?: string; retryAfterSeconds?: number; ok?: boolean; inspect?: AdminTestInspectResult; sent?: number } =
      {}
    try {
      payload = (await response.json()) as typeof payload
    } catch {
      // ignore
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof payload.error === 'string' ? payload.error : 'request_failed',
        retryAfterSeconds:
          typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : undefined,
      }
    }

    return { ok: true, data: payload }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

function disabledReasonMessage(reason: string | null): string {
  switch (reason) {
    case 'flag_off':
      return '現在、通知テスト機能は停止しています（機能フラグOFF）。'
    case 'allowlist_empty':
    case 'allowlist_invalid':
      return '現在、通知テスト機能は停止しています（テスト対象の設定が無効）。'
    case 'admin_unavailable':
      return '現在、通知テスト機能は利用できません。'
    default:
      return '現在、通知テスト機能は停止しています。'
  }
}

export function AdminNotificationTestClient({
  initialFeatureAvailable,
  initialDisabledReason,
  initialTargets,
}: Props) {
  const baseId = useId()
  const [targetId, setTargetId] = useState(
    initialTargets.length === 1 ? initialTargets[0]!.id : '',
  )
  const [inspect, setInspect] = useState<AdminTestInspectResult | null>(null)
  const [busy, setBusy] = useState<'inspect' | 'push' | 'email' | null>(null)
  const busyRef = useRef(false)
  const [, startTransition] = useTransition()

  const featureAvailable = initialFeatureAvailable && initialTargets.length > 0
  const selectedLabel = initialTargets.find((t) => t.id === targetId)?.label ?? ''

  const run = (action: 'inspect' | 'push' | 'email', confirmMessage?: string) => {
    if (busyRef.current || !featureAvailable || !targetId) return
    if (confirmMessage && !window.confirm(confirmMessage)) return

    busyRef.current = true
    setBusy(action)
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postAction(action, targetId)
        if (!result.ok) {
          if (result.status === 429) {
            toastSession.error(
              result.retryAfterSeconds
                ? `短時間に何度も実行できません。約${result.retryAfterSeconds}秒後に再度お試しください`
                : '短時間に何度も実行できません。しばらくしてから再度お試しください',
              'admin-notification-test-toast',
            )
            return
          }
          if (result.error === 'no_subscriptions') {
            toastSession.error('有効なPush購読がありません', 'admin-notification-test-toast')
            return
          }
          if (result.error === 'no_email') {
            toastSession.error('テスト用のメール送信先がありません', 'admin-notification-test-toast')
            return
          }
          if (result.error === 'push_disabled') {
            toastSession.error('Push送信機能が無効です', 'admin-notification-test-toast')
            return
          }
          toastSession.error('処理に失敗しました。もう一度お試しください', 'admin-notification-test-toast')
          return
        }

        if (action === 'inspect') {
          const data = result.data as ApiInspectResponse
          setInspect(data.inspect)
          toastSession.success('状態を確認しました', 'admin-notification-test-toast')
          return
        }
        if (action === 'push') {
          toastSession.success('テストPushを送信しました', 'admin-notification-test-toast')
          return
        }
        toastSession.success('テストメールを送信しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-6" aria-busy={busy !== null}>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-foreground">
        この画面は、許可されたテストアカウントだけに通知を送信します。
      </p>

      {!featureAvailable ? (
        <p className="text-sm text-muted" role="status">
          {disabledReasonMessage(initialDisabledReason)}
        </p>
      ) : (
        <>
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-target-heading`}
          >
            <h2 id={`${baseId}-target-heading`} className="text-base font-bold text-foreground">
              テストアカウント
            </h2>
            <label className="mt-3 block text-sm text-muted" htmlFor={`${baseId}-target`}>
              対象生徒（許可されたテストアカウントのみ）
            </label>
            <select
              id={`${baseId}-target`}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value)
                setInspect(null)
              }}
              disabled={busy !== null}
            >
              <option value="">選択してください</option>
              {initialTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-labelledby={`${baseId}-inspect-heading`}
          >
            <h2 id={`${baseId}-inspect-heading`} className="text-base font-bold text-foreground">
              状態確認（送信なし）
            </h2>
            <p className="mt-2 text-sm text-muted">
              Push・メールは送りません。event / delivery も作成しません。
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={!targetId || busy !== null}
              onClick={() => run('inspect')}
            >
              {busy === 'inspect' ? '確認中…' : '判定のみ実行'}
            </button>

            {inspect && (
              <dl className="mt-4 space-y-2 text-sm text-foreground" aria-live="polite">
                <div className="font-medium">{inspect.projectedOutcomeLabel}</div>
                <div>本日の学習記録: {inspect.recordedToday ? 'あり' : 'なし'}</div>
                <div>
                  学習リマインダー設定:{' '}
                  {inspect.preferenceEnabled ? 'ON' : 'OFF'}
                  {inspect.preferenceRowExists ? '' : '（設定行なし＝既定ON）'}
                </div>
                <div>有効なPush購読: {inspect.hasActivePushSubscription ? 'あり' : 'なし'}</div>
                <div>メールfallback: {inspect.canEmailFallback ? '可能' : '不可'}</div>
                <div>Push送信機能: {inspect.pushSendingEnabled ? 'ON' : 'OFF'}</div>
                <div>通常配信モード: {inspect.deliveryMode}</div>
              </dl>
            )}
          </section>

          <section
            className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm"
            aria-labelledby={`${baseId}-send-heading`}
          >
            <h2 id={`${baseId}-send-heading`} className="text-base font-bold text-foreground">
              実送信テスト
            </h2>
            <p className="mt-2 text-sm text-muted">
              外部通知が実際に1件送られます。一般生徒には送られません。notification type は
              test で、通常の22:00処理とは分離されます。
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={() =>
                  run(
                    'push',
                    [
                      '許可されたテストアカウントに、テスト用Pushを1件送信します。',
                      selectedLabel ? `対象表示名: ${selectedLabel}` : '',
                      '一般生徒には送られません。よろしいですか？',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
              >
                {busy === 'push' ? '送信中…' : 'このテストアカウントにPushを1件送る'}
              </button>

              <button
                type="button"
                className="rounded-xl border border-primary/40 bg-background px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
                disabled={!targetId || busy !== null}
                onClick={() =>
                  run(
                    'email',
                    [
                      '許可されたテストアカウントに、テスト用メールを1件送信します。',
                      selectedLabel ? `対象表示名: ${selectedLabel}` : '',
                      '一般生徒には送られません。よろしいですか？',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
              >
                {busy === 'email' ? '送信中…' : 'このテストアカウントにテストメールを1件送る'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
