/**
 * Strict validation for PushSubscription JSON bodies.
 * Never include endpoint/keys in returned error messages.
 */

export const MAX_ENDPOINT_LENGTH = 2048
export const MAX_P256DH_LENGTH = 200
export const MAX_AUTH_LENGTH = 100
export const MAX_USER_AGENT_LENGTH = 512
export const MAX_REQUEST_BODY_BYTES = 8_192

export type PushSubscriptionInput = {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export type PushSubscriptionParseResult =
  | { ok: true; value: PushSubscriptionInput }
  | { ok: false; code: 'invalid_json' | 'invalid_subscription' | 'payload_too_large' }

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

function isNonEmptyString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function isBase64Url(value: string, minLen: number, maxLen: number): boolean {
  if (value.length < minLen || value.length > maxLen) return false
  if (!BASE64URL_RE.test(value)) return false
  // Reject pure padding-style emptiness after normalize
  return true
}

/** Validate Push Service endpoint URL without logging it. */
export function isValidPushEndpoint(endpoint: string): boolean {
  if (!isNonEmptyString(endpoint, MAX_ENDPOINT_LENGTH)) return false

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  if (url.hash) return false

  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost')
  ) {
    return false
  }

  // Require a plausible hostname (has a dot or is a known multi-label push host)
  if (!host.includes('.') && host !== 'localhost') {
    return false
  }

  return true
}

/**
 * Parse and validate a PushSubscription-like object.
 * Extra properties are ignored (not rejected) for forward compatibility.
 */
export function parsePushSubscriptionInput(raw: unknown): PushSubscriptionParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'invalid_subscription' }
  }

  const record = raw as Record<string, unknown>
  const endpoint = record.endpoint
  const keysRaw = record.keys
  const expirationTime = record.expirationTime

  if (!isValidPushEndpoint(typeof endpoint === 'string' ? endpoint : '')) {
    return { ok: false, code: 'invalid_subscription' }
  }

  if (!keysRaw || typeof keysRaw !== 'object' || Array.isArray(keysRaw)) {
    return { ok: false, code: 'invalid_subscription' }
  }

  const keys = keysRaw as Record<string, unknown>
  const p256dh = keys.p256dh
  const auth = keys.auth

  if (typeof p256dh !== 'string' || !isBase64Url(p256dh, 20, MAX_P256DH_LENGTH)) {
    return { ok: false, code: 'invalid_subscription' }
  }
  if (typeof auth !== 'string' || !isBase64Url(auth, 10, MAX_AUTH_LENGTH)) {
    return { ok: false, code: 'invalid_subscription' }
  }

  if (
    expirationTime !== null &&
    expirationTime !== undefined &&
    (typeof expirationTime !== 'number' || !Number.isFinite(expirationTime))
  ) {
    return { ok: false, code: 'invalid_subscription' }
  }

  return {
    ok: true,
    value: {
      endpoint: endpoint as string,
      expirationTime:
        typeof expirationTime === 'number' ? expirationTime : null,
      keys: {
        p256dh,
        auth,
      },
    },
  }
}

export async function readJsonBodyLimited(
  request: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; code: 'payload_too_large' | 'invalid_json' }> {
  const raw = await request.text()
  if (raw.length > maxBytes) {
    return { ok: false, code: 'payload_too_large' }
  }
  if (!raw.trim()) {
    return { ok: false, code: 'invalid_json' }
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, code: 'invalid_json' }
  }
}

export function truncateUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null
  const trimmed = userAgent.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_USER_AGENT_LENGTH)
}
