'use client'

import { getVapidPublicKey } from '@/lib/push/env'
import { registerPushServiceWorker } from '@/lib/push/register-service-worker'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export type PushClientErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'not_configured'
  | 'permission_denied'
  | 'permission_default'
  | 'no_service_worker'
  | 'subscribe_failed'
  | 'sync_failed'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'unknown'

export type PushClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PushClientErrorCode; message: string }

export type PushLocalState = {
  supported: boolean
  /** Likely needs iOS/iPadOS home-screen install for Web Push. */
  requiresStandalone: boolean
  permission: NotificationPermissionState
  hasBrowserSubscription: boolean
  configured: boolean
}

export type PushServerStatus = {
  configured: boolean
  subscribed: boolean
}

const SAFE_MESSAGES: Record<PushClientErrorCode, string> = {
  unsupported: 'このブラウザでは通知に対応していません',
  insecure: '安全な接続（HTTPS）でのみ通知を利用できます',
  not_configured: '通知の準備が完了していません。しばらくしてからお試しください',
  permission_denied: '通知がブロックされています。ブラウザの設定から許可してください',
  permission_default: '通知の許可が必要です',
  no_service_worker: '通知の初期化に失敗しました',
  subscribe_failed: '通知の登録に失敗しました',
  sync_failed: '通知設定の同期に失敗しました',
  conflict: 'この端末の通知は別のアカウントで利用中の可能性があります',
  unauthorized: 'ログインが必要です',
  forbidden: 'この操作を行う権限がありません',
  network: '通信に失敗しました。時間をおいて再度お試しください',
  unknown: '通知の処理に失敗しました',
}

function fail<T>(code: PushClientErrorCode): PushClientResult<T> {
  return { ok: false, code, message: SAFE_MESSAGES[code] }
}

function ok<T>(value: T): PushClientResult<T> {
  return { ok: true, value }
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isSecurePushContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** Feature-detect standalone display (PWA / home screen). */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia?.('(display-mode: standalone)')?.matches
  const iosStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return Boolean(media || iosStandalone)
}

/**
 * iOS/iPadOS Safari often requires home-screen install for Web Push.
 * Prefer feature detection; UA is only a hint when PushManager is missing.
 */
export function likelyRequiresStandaloneForPush(): boolean {
  if (typeof window === 'undefined') return false
  if (isStandaloneDisplayMode()) return false
  if (isWebPushSupported()) return false

  const ua = window.navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return isIOS
}

/** Convert VAPID public key (base64url) to Uint8Array for applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function getLocalPushState(): PushLocalState {
  const configured = Boolean(getVapidPublicKey())
  if (typeof window === 'undefined') {
    return {
      supported: false,
      requiresStandalone: false,
      permission: 'unsupported',
      hasBrowserSubscription: false,
      configured,
    }
  }

  const supported = isWebPushSupported() && isSecurePushContext()
  return {
    supported,
    requiresStandalone: likelyRequiresStandaloneForPush(),
    permission: supported ? Notification.permission : 'unsupported',
    hasBrowserSubscription: false,
    configured,
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported() || !isSecurePushContext()) return null
  const regResult = await registerPushServiceWorker()
  if (!regResult.ok) return null
  try {
    return await regResult.registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

function subscriptionToJson(subscription: PushSubscription): {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
} | null {
  const json = subscription.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
  }
}

async function apiRequest(
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<PushClientResult<unknown>> {
  try {
    const response = await fetch('/api/push/subscription', {
      method,
      credentials: 'same-origin',
      headers:
        method === 'GET'
          ? { Accept: 'application/json' }
          : {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      cache: 'no-store',
    })

    if (response.status === 401) return fail('unauthorized')
    if (response.status === 403) return fail('forbidden')
    if (response.status === 409) return fail('conflict')
    if (response.status === 503) return fail('not_configured')
    if (!response.ok) return fail(response.status >= 500 ? 'unknown' : 'sync_failed')

    const data = (await response.json()) as unknown
    return ok(data)
  } catch {
    return fail('network')
  }
}

export async function fetchPushServerStatus(): Promise<PushClientResult<PushServerStatus>> {
  const result = await apiRequest('GET')
  if (!result.ok) return result
  const value = result.value
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { configured?: unknown }).configured !== 'boolean' ||
    typeof (value as { subscribed?: unknown }).subscribed !== 'boolean'
  ) {
    return fail('unknown')
  }
  return ok(value as PushServerStatus)
}

/**
 * Request permission only when invoked from an explicit user gesture path.
 * Does not call requestPermission when already denied.
 */
export async function requestNotificationPermissionFromUser(): Promise<
  PushClientResult<NotificationPermission>
> {
  if (!isWebPushSupported()) return fail('unsupported')
  if (!isSecurePushContext()) return fail('insecure')

  if (Notification.permission === 'granted') {
    return ok('granted')
  }
  if (Notification.permission === 'denied') {
    return fail('permission_denied')
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') return ok('granted')
    if (permission === 'denied') return fail('permission_denied')
    return fail('permission_default')
  } catch {
    return fail('unknown')
  }
}

async function syncSubscriptionToServer(
  subscription: PushSubscription,
): Promise<PushClientResult<{ ok: true }>> {
  const payload = subscriptionToJson(subscription)
  if (!payload) return fail('subscribe_failed')

  const result = await apiRequest('POST', payload)
  if (!result.ok) return result
  return ok({ ok: true })
}

/**
 * Explicit user-driven enable: permission → subscribe → server upsert.
 * Never call on page load.
 */
export async function enablePushSubscriptionFromUser(): Promise<
  PushClientResult<{ synced: true }>
> {
  if (!getVapidPublicKey()) return fail('not_configured')
  if (!isWebPushSupported()) return fail('unsupported')
  if (!isSecurePushContext()) return fail('insecure')

  const permission = await requestNotificationPermissionFromUser()
  if (!permission.ok) return permission

  const regResult = await registerPushServiceWorker()
  if (!regResult.ok) return fail('no_service_worker')

  const publicKey = getVapidPublicKey()
  if (!publicKey) return fail('not_configured')

  let subscription: PushSubscription | null = null
  try {
    subscription = await regResult.registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await regResult.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }
  } catch {
    return fail('subscribe_failed')
  }

  const synced = await syncSubscriptionToServer(subscription)
  if (!synced.ok) return synced
  return ok({ synced: true })
}

/**
 * Disable order: server soft-disable first, then browser unsubscribe.
 * Keeps DB from remaining "active" if unsubscribe succeeds but sync fails later.
 */
export async function disablePushSubscriptionFromUser(): Promise<
  PushClientResult<{ disabled: true }>
> {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) {
    return ok({ disabled: true })
  }

  const payload = subscriptionToJson(subscription)
  if (payload) {
    const server = await apiRequest('DELETE', payload)
    if (!server.ok && server.code !== 'unauthorized') {
      // Still attempt browser unsubscribe; resync can repair later.
    }
  }

  try {
    await subscription.unsubscribe()
  } catch {
    // Browser may already be gone; treat as disabled for UX.
  }

  return ok({ disabled: true })
}

const RESYNC_SESSION_KEY = 'jukusei.push.resync.v1'

/**
 * Silent re-sync when permission is already granted and a browser subscription exists.
 * Does not request permission or create a new subscription.
 */
export async function silentResyncPushSubscription(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!isWebPushSupported() || !isSecurePushContext()) return
  if (!getVapidPublicKey()) return
  if (Notification.permission !== 'granted') return

  try {
    if (sessionStorage.getItem(RESYNC_SESSION_KEY) === '1') return
  } catch {
    // sessionStorage may be unavailable; continue once.
  }

  const subscription = await getCurrentPushSubscription()
  if (!subscription) return

  const result = await syncSubscriptionToServer(subscription)
  if (result.ok) {
    try {
      sessionStorage.setItem(RESYNC_SESSION_KEY, '1')
    } catch {
      // ignore
    }
  }
  // Failures stay silent — do not toast on dashboard load.
}

/** Best-effort cleanup before logout. Never throws. */
export async function cleanupPushSubscriptionBeforeLogout(): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (!isWebPushSupported()) return
    const subscription = await getCurrentPushSubscription()
    if (!subscription) return

    const payload = subscriptionToJson(subscription)
    if (payload) {
      try {
        await fetch('/api/push/subscription', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        })
      } catch {
        // ignore — logout must proceed
      }
    }

    try {
      await subscription.unsubscribe()
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}
