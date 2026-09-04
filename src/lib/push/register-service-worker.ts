/**
 * Browser-side Service Worker registration for Web Push (student app).
 * Does NOT request notification permission or create a PushSubscription.
 */

export type ServiceWorkerRegisterResult =
  | { ok: true; registration: ServiceWorkerRegistration }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'failed' }

function isSecureContextForServiceWorker(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/**
 * Register `/sw.js` with scope `/`. Safe to call multiple times.
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
    const existing = await navigator.serviceWorker.getRegistration('/')
    if (existing && existing.active) {
      const scriptURL =
        existing.active.scriptURL ||
        existing.installing?.scriptURL ||
        existing.waiting?.scriptURL
      if (scriptURL && scriptURL.endsWith('/sw.js')) {
        // Soft update check; does not force page reload.
        void existing.update().catch(() => undefined)
        return { ok: true, registration: existing }
      }
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })

    // Wait until a worker is ready without crashing the app.
    await navigator.serviceWorker.ready.catch(() => undefined)

    return { ok: true, registration }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
