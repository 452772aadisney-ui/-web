'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { createToastSession } from '@/lib/toast/app-toast'
import type { NotificationOpsSnapshot } from '@/lib/admin/notification-ops-snapshot'

type Props = {
  initialSnapshot: NotificationOpsSnapshot | null
  initialLoadError: boolean
}

async function fetchSnapshot(): Promise<
  | { ok: true; snapshot: NotificationOpsSnapshot }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch('/api/admin/notification-test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'ops-snapshot' }),
      cache: 'no-store',
    })
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      snapshot?: NotificationOpsSnapshot
    }
    if (!response.ok || !payload.snapshot) {
      return {
        ok: false,
        error: typeof payload.error === 'string' ? payload.error : 'request_failed',
      }
    }
    return { ok: true, snapshot: payload.snapshot }
  } catch {
    return { ok: false, error: 'network' }
  }
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function DeliveryWindowCard({
  title,
  stats,
}: {
  title: string
  stats: NonNullable<NotificationOpsSnapshot['deliveries24h']>
}) {
  const types = Object.keys(stats.byType).sort()
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {stats.truncated ? (
        <p className="mt-1 text-xs text-amber-800">スキャン上限に達したため件数は下限です。</p>
      ) : null}
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">スキャン件数</dt>
          <dd className="font-medium">{stats.scannedDeliveries}</dd>
        </div>
        <div>
          <dt className="text-muted">404/410 失効</dt>
          <dd className="font-medium">{stats.errorBuckets.gone_404_410}</dd>
        </div>
        <div>
          <dt className="text-muted">429</dt>
          <dd className="font-medium">{stats.errorBuckets.rate_limited_429}</dd>
        </div>
        <div>
          <dt className="text-muted">network</dt>
          <dd className="font-medium">{stats.errorBuckets.network}</dd>
        </div>
        <div>
          <dt className="text-muted">provider error</dt>
          <dd className="font-medium">{stats.errorBuckets.provider_error}</dd>
        </div>
        <div>
          <dt className="text-muted">stale pending 記録</dt>
          <dd className="font-medium">{stats.errorBuckets.stale_pending}</dd>
        </div>
      </dl>
      {types.length === 0 ? (
        <p className="mt-2 text-sm text-muted">この期間の delivery はありません。</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {types.map((type) => {
            const row = stats.byType[type]!
            return (
              <li key={type} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium">{type}</p>
                <p className="text-muted">
                  Push pending {row.push.pending} / sent {row.push.sent} / failed {row.push.failed} /
                  skipped {row.push.skipped}
                </p>
                <p className="text-muted">
                  Email pending {row.email.pending} / sent {row.email.sent} / failed{' '}
                  {row.email.failed} / skipped {row.email.skipped}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function AdminNotificationOpsClient({
  initialSnapshot,
  initialLoadError,
}: Props) {
  const baseId = useId()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [loadError, setLoadError] = useState(initialLoadError)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [, startTransition] = useTransition()

  const refresh = () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const toastSession = createToastSession()

    startTransition(async () => {
      try {
        const result = await fetchSnapshot()
        if (!result.ok) {
          setLoadError(true)
          toastSession.error(
            '通知基盤の状態を取得できませんでした',
            'admin-notification-ops-toast',
          )
          return
        }
        setSnapshot(result.snapshot)
        setLoadError(false)
        toastSession.success('最新状態に更新しました', 'admin-notification-ops-toast')
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    })
  }

  return (
    <div className="space-y-8" aria-busy={busy}>
      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-ops-heading`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${baseId}-ops-heading`} className="text-base font-bold text-foreground">
              通知基盤の状態
            </h2>
            <p className="mt-2 text-sm text-muted">
              秘密値・allowlist ID・endpointは表示しません。この操作は通知を送りません。
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
            disabled={busy}
            onClick={refresh}
          >
            {busy ? '更新中…' : '最新状態に更新'}
          </button>
        </div>

        {loadError && !snapshot ? (
          <p className="mt-4 text-sm text-amber-800" role="status">
            通知基盤の状態を取得できませんでした
          </p>
        ) : null}

        {snapshot ? (
          <div className="mt-4 space-y-6">
            <p className="text-xs text-muted">
              評価: {formatTime(snapshot.evaluatedAt)} / {snapshot.durationMs} ms
              {snapshot.timedOut ? ' / soft timeout（一部未取得）' : ''}
            </p>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Push送信機能</dt>
                <dd className="font-medium">{snapshot.env.pushSending}</dd>
              </div>
              <div>
                <dt className="text-muted">Push送信可否（総合）</dt>
                <dd className="font-medium">
                  {snapshot.env.pushSendingAvailable ? '利用可' : '利用不可'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">VAPID公開鍵</dt>
                <dd className="font-medium">
                  {snapshot.env.vapidPublicKey === 'configured' ? '設定済み' : '未設定'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">VAPID秘密鍵</dt>
                <dd className="font-medium">
                  {snapshot.env.vapidPrivateKey === 'configured' ? '設定済み' : '未設定'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">VAPID SUBJECT</dt>
                <dd className="font-medium">
                  {snapshot.env.vapidSubject === 'configured' ? '設定済み' : '未設定'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">管理者テスト</dt>
                <dd className="font-medium">{snapshot.env.adminTest}</dd>
              </div>
              <div>
                <dt className="text-muted">CRON_SECRET</dt>
                <dd className="font-medium">
                  {snapshot.env.cronSecret === 'configured' ? '設定済み' : '未設定'}
                </dd>
              </div>
            </dl>

            <section aria-labelledby={`${baseId}-modes-heading`}>
              <h3 id={`${baseId}-modes-heading`} className="text-sm font-semibold">
                各カテゴリの配信モード
              </h3>
              <ul className="mt-2 space-y-3">
                {snapshot.modes.map((mode) => (
                  <li key={mode.id} className="rounded-xl border border-border bg-background p-4">
                    <p className="font-medium">{mode.label}</p>
                    <p className="mt-1 text-sm text-muted">{mode.description}</p>
                    <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">設定値</dt>
                        <dd className="font-medium">{mode.configuredModeRaw}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">実効モード</dt>
                        <dd className="font-medium">{mode.effectiveMode}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">allowlist</dt>
                        <dd className="font-medium">
                          {mode.allowlistConfigured
                            ? `設定済み（${mode.allowlistCount ?? 0}件）`
                            : mode.allowlistInvalid
                              ? '不正'
                              : '未設定'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Push送信</dt>
                        <dd className="font-medium">{mode.pushSending}</dd>
                      </div>
                    </dl>
                    {mode.warning ? (
                      <p className="mt-2 text-sm text-amber-800" role="status">
                        {mode.warning}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby={`${baseId}-subs-heading`}>
              <h3 id={`${baseId}-subs-heading`} className="text-sm font-semibold">
                購読・通知設定の集計
              </h3>
              {snapshot.subscriptionsError || !snapshot.subscriptions ? (
                <p className="mt-2 text-sm text-amber-800">購読集計を取得できませんでした</p>
              ) : (
                <>
                  {snapshot.subscriptions.queryTruncated ? (
                    <p className="mt-1 text-xs text-amber-800">
                      取得上限のため件数は近似です。
                    </p>
                  ) : null}
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">生徒数</dt>
                      <dd className="font-medium">{snapshot.subscriptions.studentCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読あり</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.studentsWithActivePush}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読なし</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.studentsWithoutActivePush}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">有効Push購読総数</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.activeSubscriptionCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">複数端末購読</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.multiDeviceStudentCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">無効化購読数</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.disabledSubscriptionCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">学習リマインダー停止</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.preferenceDisabled.study_reminder}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">お知らせ停止</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.preferenceDisabled.announcement}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">メッセージ停止</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.preferenceDisabled.message}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">コーチング停止</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.preferenceDisabled.coaching_reminder}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">配信手段なしの可能性</dt>
                      <dd className="font-medium">
                        {snapshot.subscriptions.possiblyUndeliverable}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section aria-labelledby={`${baseId}-history-heading`} className="space-y-3">
              <h3 id={`${baseId}-history-heading`} className="text-sm font-semibold">
                最近の配信結果（件数のみ）
              </h3>
              {snapshot.deliveriesError ? (
                <p className="text-sm text-amber-800">配信履歴を取得できませんでした</p>
              ) : (
                <>
                  {snapshot.deliveries24h ? (
                    <DeliveryWindowCard title="直近24時間" stats={snapshot.deliveries24h} />
                  ) : null}
                  {snapshot.deliveries7d ? (
                    <DeliveryWindowCard title="直近7日間" stats={snapshot.deliveries7d} />
                  ) : null}
                </>
              )}
            </section>

            <section aria-labelledby={`${baseId}-pending-heading`}>
              <h3 id={`${baseId}-pending-heading`} className="text-sm font-semibold">
                pending 監視（自動再送なし）
              </h3>
              {snapshot.pendingError || !snapshot.pending ? (
                <p className="mt-2 text-sm text-amber-800">pending 状態を取得できませんでした</p>
              ) : (
                <div className="mt-2 space-y-2 text-sm">
                  <p>
                    fresh pending: <strong>{snapshot.pending.freshPending}</strong> / stale pending
                    （10分超・要確認）: <strong>{snapshot.pending.stalePending}</strong>
                  </p>
                  {snapshot.pending.stalePending > 0 ? (
                    <p className="text-amber-800" role="status">
                      stale pending があります。要確認（この画面から再送しません）。
                    </p>
                  ) : null}
                  <ul className="space-y-1">
                    {snapshot.pending.byTypeChannel.map((row) => (
                      <li key={`${row.notificationType}-${row.channel}`}>
                        {row.notificationType} / {row.channel}: fresh {row.fresh} / stale{' '}
                        {row.stale}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section aria-labelledby={`${baseId}-failures-heading`}>
              <h3 id={`${baseId}-failures-heading`} className="text-sm font-semibold">
                直近の失敗（個人情報なし）
              </h3>
              {snapshot.recentFailuresError ? (
                <p className="mt-2 text-sm text-amber-800">失敗履歴を取得できませんでした</p>
              ) : snapshot.recentFailures.length === 0 ? (
                <p className="mt-2 text-sm text-muted">直近の失敗はありません。</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {snapshot.recentFailures.map((row, index) => (
                    <li
                      key={`${row.occurredAt}-${row.notificationType}-${index}`}
                      className="rounded-lg border border-border px-3 py-2"
                    >
                      <p>{formatTime(row.occurredAt)}</p>
                      <p className="text-muted">
                        {row.notificationType} / {row.channel} / {row.errorCode}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby={`${baseId}-cron-heading`}>
              <h3 id={`${baseId}-cron-heading`} className="text-sm font-semibold">
                Cron一覧（コード定義）
              </h3>
              <p className="mt-1 text-sm text-muted">
                この画面から手動実行しません。最終実行時刻は推測せず Vercel Logs で確認してください。
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.crons.map((cron) => (
                  <li key={cron.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-medium">{cron.path}</p>
                    <p className="text-muted">
                      UTC {cron.scheduleUtc} / {cron.scheduleJstLabel}
                    </p>
                    <p className="text-muted">{cron.note}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby={`${baseId}-recovery-heading`}>
              <h3 id={`${baseId}-recovery-heading`} className="text-sm font-semibold">
                問題時の復旧手順（要約）
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {snapshot.recoveryHints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}
