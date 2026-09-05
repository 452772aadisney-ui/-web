'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { createToastSession } from '@/lib/toast/app-toast'
import type { AdminTestInspectResult, AdminTestTargetOption } from '@/lib/admin/notification-test-service'
import type { AdminFullDryRunReport } from '@/lib/study/study-reminder-dry-run'

type Props = {
  initialFeatureAvailable: boolean
  initialFlagEnabled: boolean
  initialDisabledReason: string | null
  initialTargets: AdminTestTargetOption[]
}

type ApiInspectResponse = { ok: true; inspect: AdminTestInspectResult }

type ApiDryRunResponse = {
  ok: true
  dryRun: AdminFullDryRunReport
  sumConsistent: { readiness: boolean; current: boolean }
  notice: string
}

async function postJson(
  body: Record<string, unknown>,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number }
> {
  try {
    const response = await fetch('/api/admin/notification-test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    let payload: {
      error?: string
      retryAfterSeconds?: number
      ok?: boolean
      inspect?: AdminTestInspectResult
      sent?: number
      dryRun?: AdminFullDryRunReport
      sumConsistent?: { readiness: boolean; current: boolean }
      notice?: string
    } = {}
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
      return '現在、テストアカウント送信は停止しています（テスト対象の設定が無効）。全体dry-runは機能フラグONなら利用できます。'
    case 'admin_unavailable':
      return '現在、通知テスト機能は利用できません。'
    default:
      return '現在、通知テスト機能は停止しています。'
  }
}

function formatEvaluatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function AdminNotificationTestClient({
  initialFeatureAvailable,
  initialFlagEnabled,
  initialDisabledReason,
  initialTargets,
}: Props) {
  const baseId = useId()
  const [targetId, setTargetId] = useState(
    initialTargets.length === 1 ? initialTargets[0]!.id : '',
  )
  const [inspect, setInspect] = useState<AdminTestInspectResult | null>(null)
  const [dryRun, setDryRun] = useState<AdminFullDryRunReport | null>(null)
  const [dryRunSumOk, setDryRunSumOk] = useState<{
    readiness: boolean
    current: boolean
  } | null>(null)
  const [busy, setBusy] = useState<'inspect' | 'push' | 'email' | 'full-dry-run' | null>(null)
  const busyRef = useRef(false)
  const [, startTransition] = useTransition()

  const sendFeatureAvailable = initialFeatureAvailable && initialTargets.length > 0
  const dryRunAvailable = initialFlagEnabled
  const selectedLabel = initialTargets.find((t) => t.id === targetId)?.label ?? ''

  const runSendAction = (action: 'inspect' | 'push' | 'email', confirmMessage?: string) => {
    if (busyRef.current || !sendFeatureAvailable || !targetId) return
    if (confirmMessage && !window.confirm(confirmMessage)) return

    busyRef.current = true
    setBusy(action)
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action, targetUserId: targetId })
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

  const runFullDryRun = () => {
    if (busyRef.current || !dryRunAvailable) return

    busyRef.current = true
    setBusy('full-dry-run')
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await postJson({ action: 'full-dry-run' })
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
          if (result.error === 'in_progress') {
            toastSession.error('dry-runの実行中です。完了後に再度お試しください', 'admin-notification-test-toast')
            return
          }
          toastSession.error('dry-runを完了できませんでした', 'admin-notification-test-toast')
          return
        }

        const data = result.data as ApiDryRunResponse
        setDryRun(data.dryRun)
        setDryRunSumOk(data.sumConsistent)
        toastSession.success('dry-runの集計が完了しました', 'admin-notification-test-toast')
      } finally {
        busyRef.current = false
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-8" aria-busy={busy !== null}>
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-dry-run-heading`}
      >
        <h2 id={`${baseId}-dry-run-heading`} className="text-base font-bold text-foreground">
          全体dry-run
        </h2>
        <p className="mt-2 text-sm text-muted">
          現在のデータを使って、22:00の新しい通知方式なら何人が各処理の対象になるか確認します。Push・メールは送信しません。
        </p>

        {!dryRunAvailable ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {disabledReasonMessage(initialDisabledReason ?? 'flag_off')}
          </p>
        ) : (
          <>
            <button
              type="button"
              className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
              disabled={busy !== null}
              onClick={runFullDryRun}
            >
              {busy === 'full-dry-run' ? '集計中…' : '全体dry-runを実行'}
            </button>

            {dryRun && (
              <div className="mt-4 space-y-4" aria-live="polite">
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground">
                  これは判定結果の確認です。Push・メールは送信されていません。
                </p>
                <dl className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">対象日（JST）</dt>
                    <dd className="font-medium">{dryRun.dateKey}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">実行日時</dt>
                    <dd className="font-medium">{formatEvaluatedAt(dryRun.evaluatedAt)}</dd>
                  </div>
                  {typeof dryRun.durationMs === 'number' ? (
                    <div>
                      <dt className="text-muted">処理時間</dt>
                      <dd className="font-medium">{dryRun.durationMs} ms</dd>
                    </div>
                  ) : null}
                </dl>

                <section
                  className="rounded-xl border border-border bg-background p-4"
                  aria-labelledby={`${baseId}-readiness-heading`}
                >
                  <h3
                    id={`${baseId}-readiness-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    Pushを有効化した場合の準備状況
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    準備状況は、Push送信を有効にした場合の想定です。このdry-runでは実際の通知は送信していません。
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">生徒数</dt>
                      <dd className="font-medium">{dryRun.readiness.totalStudents}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日記録済み</dt>
                      <dd className="font-medium">{dryRun.readiness.alreadyRecorded}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日未記録</dt>
                      <dd className="font-medium">{dryRun.readiness.missingStudyLog}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">通知設定ON（設定行なし含む）</dt>
                      <dd className="font-medium">{dryRun.readiness.preferenceEnabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{dryRun.readiness.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読あり</dt>
                      <dd className="font-medium">
                        {dryRun.readiness.withActivePushSubscription}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読なし</dt>
                      <dd className="font-medium">
                        {dryRun.readiness.withoutActivePushSubscription}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールあり</dt>
                      <dd className="font-medium">{dryRun.readiness.withEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">メールなし</dt>
                      <dd className="font-medium">{dryRun.readiness.withoutEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push有効化時のPush対象</dt>
                      <dd className="font-medium">{dryRun.readiness.readyForPush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push有効化時のメールfallback</dt>
                      <dd className="font-medium">{dryRun.readiness.emailOnly}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{dryRun.readiness.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{dryRun.readiness.failedToEvaluate}</dd>
                    </div>
                  </dl>
                  {dryRunSumOk?.readiness === false ? (
                    <p className="mt-2 text-sm text-amber-800" role="status">
                      準備状況の最終分類合計が生徒数と一致しません。
                    </p>
                  ) : null}
                </section>

                <section
                  className="rounded-xl border border-border bg-background p-4"
                  aria-labelledby={`${baseId}-current-heading`}
                >
                  <h3
                    id={`${baseId}-current-heading`}
                    className="text-sm font-semibold text-foreground"
                  >
                    現在の本番設定での動作
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {dryRun.current.legacyEmailPreferred
                      ? '通常配信モードが legacy / dry-run のため、実配信は従来メールが優先されます（Pushは送りません）。'
                      : '通常配信モードに沿った新方式の分岐です。Push送信機能がOFFならPush対象は0になります。'}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">通常配信モード</dt>
                      <dd className="font-medium">{dryRun.current.deliveryMode}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Push送信機能</dt>
                      <dd className="font-medium">
                        {dryRun.current.pushSendingEnabled ? 'ON' : 'OFF'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">生徒数</dt>
                      <dd className="font-medium">{dryRun.current.totalStudents}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">本日記録済み</dt>
                      <dd className="font-medium">{dryRun.current.alreadyRecorded}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">管理者により停止</dt>
                      <dd className="font-medium">{dryRun.current.preferenceDisabled}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">現在設定でのPush対象</dt>
                      <dd className="font-medium">{dryRun.current.wouldUsePush}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">現在設定でのメール経路</dt>
                      <dd className="font-medium">{dryRun.current.wouldUseEmail}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なし</dt>
                      <dd className="font-medium">{dryRun.current.cannotDeliver}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">判定エラー</dt>
                      <dd className="font-medium">{dryRun.current.failedToEvaluate}</dd>
                    </div>
                  </dl>
                  {dryRunSumOk?.current === false ? (
                    <p className="mt-2 text-sm text-amber-800" role="status">
                      現在設定の最終分類合計が生徒数と一致しません。
                    </p>
                  ) : null}
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <div className="border-t border-border pt-2">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-foreground">
          以下は許可されたテストアカウントだけへの実送信・個別確認です。全体dry-runとは別の操作です。
        </p>
      </div>

      {!sendFeatureAvailable ? (
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
              onClick={() => runSendAction('inspect')}
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
                  runSendAction(
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
                  runSendAction(
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
