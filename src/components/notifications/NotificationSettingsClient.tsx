'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getNotificationPreferences } from '@/app/notifications/actions'
import {
  deriveDeviceNotificationStatus,
  deviceStatusDetail,
  deviceStatusHeadline,
  type DeviceNotificationStatus,
} from '@/lib/push/device-status'
import {
  disablePushSubscriptionFromUser,
  enablePushSubscriptionFromUser,
  fetchPushServerStatus,
  getCurrentPushSubscription,
  getLocalPushState,
  isStandaloneDisplayMode,
  likelyRequiresStandaloneForPush,
  sendTestPushNotificationFromUser,
} from '@/lib/push/client'
import { getVapidPublicKey } from '@/lib/push/env'
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  NOTIFICATION_PREFERENCE_COPY,
  notificationCategoryStatusLabel,
  type NotificationPreferencesView,
} from '@/lib/push/preferences'
import { createToastSession } from '@/lib/toast/app-toast'
import { cn } from '@/lib/utils'

type PrefsLoadState = 'loading' | 'ready' | 'error'

export function NotificationSettingsClient({
  initialPreferences,
  initialPrefsFromDatabase,
  initialPrefsError,
}: {
  initialPreferences: NotificationPreferencesView
  initialPrefsFromDatabase: boolean
  initialPrefsError: boolean
}) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceNotificationStatus>('loading')
  const [prefs, setPrefs] = useState<NotificationPreferencesView>(initialPreferences)
  const [prefsState, setPrefsState] = useState<PrefsLoadState>(
    initialPrefsError ? 'error' : 'ready',
  )
  const [prefsFromDatabase, setPrefsFromDatabase] = useState(initialPrefsFromDatabase)
  const [deviceBusy, setDeviceBusy] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [sendingEnabled, setSendingEnabled] = useState(false)
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const busyRef = useRef(false)
  const testBusyRef = useRef(false)
  const baseId = useId()

  const refreshDeviceStatus = useCallback(async () => {
    const local = getLocalPushState()
    const configured = Boolean(getVapidPublicKey()) || local.configured
    const requiresStandalone = likelyRequiresStandaloneForPush()
    setShowIosGuide(requiresStandalone)

    let browserSubscription = false
    try {
      const sub = await getCurrentPushSubscription()
      browserSubscription = Boolean(sub)
    } catch {
      browserSubscription = false
    }
    setHasBrowserSubscription(browserSubscription)

    let serverSubscribed = false
    let serverStatusFailed = false
    let nextSendingEnabled = false
    const server = await fetchPushServerStatus()
    if (server.ok) {
      serverSubscribed = server.value.subscribed
      nextSendingEnabled = server.value.sendingEnabled
    } else if (server.code === 'network' || server.code === 'unknown') {
      serverStatusFailed = true
    }
    setSendingEnabled(nextSendingEnabled)

    const permission =
      local.permission === 'granted' ||
      local.permission === 'denied' ||
      local.permission === 'default'
        ? local.permission
        : 'unsupported'

    setDeviceStatus(
      deriveDeviceNotificationStatus({
        supported: local.supported,
        requiresStandalone,
        configured,
        permission,
        hasBrowserSubscription: browserSubscription,
        serverSubscribed,
        serverStatusFailed,
      }),
    )
  }, [])

  const refreshPreferences = useCallback(async () => {
    const result = await getNotificationPreferences()
    if (!result.ok) {
      setPrefsState('error')
      return
    }
    setPrefs(result.preferences)
    setPrefsFromDatabase(result.fromDatabase)
    setPrefsState('ready')
  }, [])

  useEffect(() => {
    void refreshDeviceStatus()
  }, [refreshDeviceStatus])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshDeviceStatus()
      }
    }
    const onFocus = () => {
      void refreshDeviceStatus()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshDeviceStatus])

  const handleEnable = async () => {
    if (busyRef.current) return
    if (deviceStatus === 'permission_denied') return

    busyRef.current = true
    setDeviceBusy(true)
    const toastSession = createToastSession()

    try {
      const result = await enablePushSubscriptionFromUser()
      if (!result.ok) {
        toastSession.error(result.message)
        await refreshDeviceStatus()
        return
      }
      toastSession.success('この端末の通知を有効にしました')
      await refreshDeviceStatus()
    } finally {
      busyRef.current = false
      setDeviceBusy(false)
    }
  }

  const handleDisable = async () => {
    if (busyRef.current) return
    if (
      !window.confirm(
        'この端末のWeb通知を停止すると、必要なお知らせはメールで届きます。よろしいですか？',
      )
    ) {
      return
    }

    busyRef.current = true
    setDeviceBusy(true)
    const toastSession = createToastSession()

    try {
      const result = await disablePushSubscriptionFromUser()
      if (!result.ok) {
        toastSession.error(result.message)
        await refreshDeviceStatus()
        return
      }
      toastSession.success('この端末の通知を停止しました')
      await refreshDeviceStatus()
    } finally {
      busyRef.current = false
      setDeviceBusy(false)
    }
  }

  const handleSendTest = async () => {
    if (testBusyRef.current || busyRef.current) return
    testBusyRef.current = true
    setTestBusy(true)
    const toastSession = createToastSession()

    try {
      const result = await sendTestPushNotificationFromUser()
      if (!result.ok) {
        toastSession.error(result.message, 'notification-test-toast')
        await refreshDeviceStatus()
        return
      }
      toastSession.success('テスト通知を送信しました', 'notification-test-toast')
      await refreshDeviceStatus()
    } finally {
      testBusyRef.current = false
      setTestBusy(false)
    }
  }

  const headline = deviceStatusHeadline(deviceStatus)
  const detail = deviceStatusDetail(deviceStatus)
  const canEnable =
    !deviceBusy &&
    (deviceStatus === 'permission_default' ||
      deviceStatus === 'ready_to_enable' ||
      deviceStatus === 'needs_sync')
  const canDisable = !deviceBusy && deviceStatus === 'subscribed'
  const showDeniedRetry = deviceStatus === 'permission_denied'
  const canSendTest =
    deviceStatus === 'subscribed' &&
    hasBrowserSubscription &&
    sendingEnabled &&
    !deviceBusy &&
    !testBusy
  const showTestUnavailableHint =
    deviceStatus === 'subscribed' && hasBrowserSubscription && !sendingEnabled
  const needsPushPrompt =
    deviceStatus === 'permission_default' ||
    deviceStatus === 'ready_to_enable' ||
    deviceStatus === 'needs_sync' ||
    deviceStatus === 'permission_denied'

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        通知は、まずWeb通知でお届けします。Web通知を利用できない場合は、登録メールアドレスへお送りします。
      </p>

      {needsPushPrompt && (
        <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
          大切なお知らせをすぐ確認できるよう、この端末の通知を有効にしてください。
        </p>
      )}

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-device-heading`}
        aria-busy={deviceStatus === 'loading' || deviceBusy}
      >
        <h2 id={`${baseId}-device-heading`} className="text-base font-bold text-foreground">
          この端末の通知
        </h2>
        <p className="mt-2 text-sm font-medium text-foreground" role="status">
          {headline}
        </p>
        {detail && <p className="mt-2 text-sm text-muted">{detail}</p>}

        {showIosGuide && !isStandaloneDisplayMode() && (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Safariの共有ボタンを押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
            <li>追加した「受験生web」を開く</li>
            <li>通知設定をもう一度開く</li>
          </ol>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canEnable && (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={deviceBusy}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {deviceBusy
                ? '処理中…'
                : deviceStatus === 'needs_sync'
                  ? 'この端末の通知を同期する'
                  : 'この端末で通知を受け取る'}
            </button>
          )}

          {canDisable && (
            <button
              type="button"
              onClick={() => void handleDisable()}
              disabled={deviceBusy}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
            >
              {deviceBusy ? '処理中…' : 'この端末の通知を停止する'}
            </button>
          )}

          {canDisable && (
            <p className="w-full text-sm text-muted">
              この端末のWeb通知を停止すると、必要なお知らせはメールで届きます。
            </p>
          )}

          {canSendTest && (
            <button
              type="button"
              onClick={() => void handleSendTest()}
              disabled={testBusy || deviceBusy}
              className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
            >
              {testBusy ? '送信中…' : 'テスト通知を送る'}
            </button>
          )}

          {showTestUnavailableHint && (
            <p className="w-full text-sm text-muted">
              現在テスト通知は利用できません。通知の受け取り設定や購読はそのまま利用できます。
            </p>
          )}

          {showDeniedRetry && (
            <button
              type="button"
              onClick={() => void refreshDeviceStatus()}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card"
            >
              状態を再確認する
            </button>
          )}

          {(deviceStatus === 'network_error' || deviceStatus === 'loading') && (
            <button
              type="button"
              onClick={() => void refreshDeviceStatus()}
              disabled={deviceBusy}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:opacity-60"
            >
              再読み込み
            </button>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby={`${baseId}-prefs-heading`}
      >
        <h2 id={`${baseId}-prefs-heading`} className="text-base font-bold text-foreground">
          受け取る通知の種類
        </h2>
        <p className="mt-2 text-sm text-muted">
          通知の配信可否は塾側で管理しています。こちらでは状態の確認のみできます。
        </p>

        {prefsState === 'error' ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted" role="alert">
              {deviceStatusDetail('prefs_load_error')}
            </p>
            <button
              type="button"
              onClick={() => {
                setPrefsState('loading')
                void refreshPreferences()
              }}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium"
            >
              設定を再読み込み
            </button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => {
              const copy = NOTIFICATION_PREFERENCE_COPY[category]
              const enabled = prefs[category]

              return (
                <li key={category} className="flex items-start justify-between gap-4 py-4 first:pt-2">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{copy.title}</span>
                    <span className="mt-1 block text-sm text-muted">{copy.description}</span>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium',
                      enabled
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-50 text-amber-900',
                    )}
                  >
                    {notificationCategoryStatusLabel(enabled)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {!prefsFromDatabase && prefsState === 'ready' && (
          <p className="mt-2 text-xs text-muted">設定行がない場合は、すべて有効として扱われます。</p>
        )}
      </section>
    </div>
  )
}
