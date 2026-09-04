/**
 * Browser-side Service Worker registration for Web Push (student app).
 * Does NOT request notification permission or create a PushSubscription.
 */

export type ServiceWorkerRegisterResult =
  | { ok: true; registration: ServiceWorkerRegistration }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'failed' }

/** SW / PWA control limited to student dashboard routes (trailing slash). */
export const PUSH_SERVICE_WORKER_SCOPE = '/dashboard/'

export const PUSH_SERVICE_WORKER_URL = '/sw.js'

function isSecureContextForServiceWorker(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

function scriptUrlLooksLikePushWorker(scriptURL: string): boolean {
  try {
    return new URL(scriptURL).pathname.endsWith('/sw.js') || scriptURL.endsWith('/sw.js')
  } catch {
    return scriptURL.endsWith('/sw.js')
  }
}

/** True when registration.scope pathname is exactly `/dashboard/`. */
export function isDesiredPushServiceWorkerScope(scopeUrl: string): boolean {
  try {
    return new URL(scopeUrl).pathname === PUSH_SERVICE_WORKER_SCOPE
  } catch {
    return false
  }
}

/**
 * Unregister legacy push workers (e.g. scope `/`) so /admin is no longer controlled.
 * Safe no-op when none exist.
 */
export async function unregisterStalePushServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations.map(async (registration) => {
      const scriptURL =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        ''
      if (!scriptUrlLooksLikePushWorker(scriptURL)) return
      if (isDesiredPushServiceWorkerScope(registration.scope)) return
      try {
        await registration.unregister()
      } catch {
        // Ignore unregister failures; next visit can retry.
      }
    }),
  )
}

/**
 * Register `/sw.js` with scope `/dashboard/`. Safe to call multiple times.
 * Migrates away from older scope `/` registrations.
 * Never throws; never includes secrets in errors.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegisterResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' }
  }

  if (!isSecureContextForServiceWorker()) {
    return { ok: false, reason: 'insecure' }
  }

  try {
    await unregisterStalePushServiceWorkers()

    const existing = await navigator.serviceWorker.getRegistration(PUSH_SERVICE_WORKER_SCOPE)
    if (existing && isDesiredPushServiceWorkerScope(existing.scope)) {
      const scriptURL =
        existing.active?.scriptURL ||
        existing.installing?.scriptURL ||
        existing.waiting?.scriptURL ||
        ''
      if (scriptUrlLooksLikePushWorker(scriptURL)) {
        void existing.update().catch(() => undefined)
        return { ok: true, registration: existing }
      }
    }

    const registration = await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_URL, {
      scope: PUSH_SERVICE_WORKER_SCOPE,
      updateViaCache: 'none',
    })

    // Do not await navigator.serviceWorker.ready: on `/dashboard` (no trailing slash)
    // the page is outside scope `/dashboard/` and would not become controlled.
    return { ok: true, registration }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
