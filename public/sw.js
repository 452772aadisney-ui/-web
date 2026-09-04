/* 受験生web Web Push Service Worker
 * - No fetch handler / no offline cache
 * - Payload validation mirrors src/lib/push/notification-payload.ts
 * - Never log endpoints, keys, or tokens
 */
/* eslint-disable no-restricted-globals */

const DEFAULT_TITLE = '受験生web'
const DEFAULT_BODY = '新しいお知らせがあります'
const DEFAULT_PATH = '/dashboard'
const MAX_TITLE = 64
const MAX_BODY = 120
const MAX_TAG = 64
const MAX_PATH = 512
const ICON_URL = '/icons/pwa/icon-192.png'
const BADGE_URL = '/icons/pwa/badge-96.png'

function sanitizeDashboardPath(raw) {
  if (typeof raw !== 'string') return DEFAULT_PATH
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_PATH) return DEFAULT_PATH
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return DEFAULT_PATH
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return DEFAULT_PATH
  }
  const pathOnly = trimmed.split(/[?#]/, 1)[0] || ''
  const isExact = pathOnly === '/dashboard'
  const isNested = pathOnly.startsWith('/dashboard/')
  if (!isExact && !isNested) {
    if (!(trimmed.startsWith('/dashboard?') && pathOnly === '/dashboard')) {
      return DEFAULT_PATH
    }
  }
  if (pathOnly === '/admin' || pathOnly.startsWith('/admin/')) return DEFAULT_PATH
  return trimmed
}

function truncateText(value, max) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length <= max) return normalized
  return normalized.slice(0, Math.max(0, max - 1)) + '…'
}

function sanitizeTag(raw) {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw
    .trim()
    .replace(/[^\w.:@-]/g, '')
    .slice(0, MAX_TAG)
  return cleaned.length > 0 ? cleaned : undefined
}

function parsePayload(rawText) {
  const fallback = {
    title: DEFAULT_TITLE,
    body: DEFAULT_BODY,
    targetPath: DEFAULT_PATH,
  }

  if (rawText == null) return fallback
  const text = String(rawText).trim()
  if (!text || text.length > 8000) return fallback

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return fallback
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback
  }

  const title = truncateText(
    typeof parsed.title === 'string' ? parsed.title : DEFAULT_TITLE,
    MAX_TITLE,
  )
  const body = truncateText(
    typeof parsed.body === 'string' ? parsed.body : DEFAULT_BODY,
    MAX_BODY,
  )

  return {
    title: title || DEFAULT_TITLE,
    body: body || DEFAULT_BODY,
    targetPath: sanitizeDashboardPath(parsed.targetPath),
    tag: sanitizeTag(parsed.tag),
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let raw = null
      try {
        raw = event.data ? event.data.text() : null
      } catch {
        raw = null
      }

      const payload = parsePayload(raw)
      const options = {
        body: payload.body,
        icon: ICON_URL,
        badge: BADGE_URL,
        data: {
          targetPath: payload.targetPath,
        },
      }
      if (payload.tag) {
        options.tag = payload.tag
        options.renotify = true
      }

      try {
        await self.registration.showNotification(payload.title, options)
      } catch {
        // Avoid throwing out of the SW for notification display failures.
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const fromData =
    event.notification && event.notification.data
      ? event.notification.data.targetPath
      : undefined
  const targetPath = sanitizeDashboardPath(fromData)
  const targetUrl = new URL(targetPath, self.location.origin)

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      const sameOrigin = []
      for (const client of allClients) {
        try {
          const url = new URL(client.url)
          if (url.origin === self.location.origin) {
            sameOrigin.push({ client, pathname: url.pathname })
          }
        } catch {
          // ignore bad client urls
        }
      }

      const dashboardClient = sameOrigin.find(
        ({ pathname }) =>
          pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
      )

      if (dashboardClient && dashboardClient.client) {
        const client = dashboardClient.client
        await client.focus()
        if (typeof client.navigate === 'function') {
          try {
            await client.navigate(targetUrl.href)
            return
          } catch {
            // fall through to openWindow
          }
        }
      }

      // Do not navigate /admin (or other non-dashboard) tabs to student paths.
      if (typeof self.clients.openWindow === 'function') {
        await self.clients.openWindow(targetUrl.href)
      }
    })(),
  )
})

// Expose helpers for unit tests in Node (ignored in browser SW scope).
if (typeof globalThis !== 'undefined' && globalThis.__JUKUSEI_SW_TEST__) {
  globalThis.__JUKUSEI_SW_HELPERS__ = {
    sanitizeDashboardPath,
    parsePayload,
  }
}
