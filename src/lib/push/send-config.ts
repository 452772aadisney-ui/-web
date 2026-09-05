/**
 * Server-side Push send configuration.
 * Safe to import: does not throw; never returns secret values in errors.
 * Intended for Node.js server modules only (do not import from Client Components).
 */

export const TEST_NOTIFICATION_COOLDOWN_MS = 30_000

export type PushSendConfigFailureReason = 'disabled' | 'incomplete' | 'invalid'

export type PushSendConfigResult =
  | {
      ok: true
      publicKey: string
      privateKey: string
      subject: string
    }
  | {
      ok: false
      reason: PushSendConfigFailureReason
    }

function isValidVapidSubject(subject: string): boolean {
  if (subject.startsWith('mailto:')) {
    const address = subject.slice('mailto:'.length).trim()
    return address.length > 2 && address.includes('@') && !address.includes(' ')
  }
  try {
    const url = new URL(subject)
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch {
    return false
  }
}

function looksLikeBase64UrlKey(value: string, minLen: number): boolean {
  return value.length >= minLen && /^[A-Za-z0-9_-]+$/.test(value)
}

/**
 * Resolve whether Push sending is allowed and VAPID details are usable.
 *
 * Policy:
 * - PUSH_SENDING_ENABLED must be exactly `true`
 * - When `VERCEL_ENV` is set and not `production` (Preview / Vercel Development),
 *   sending is disabled even if the flag is true (misconfiguration guard)
 * - Local/dev without `VERCEL_ENV` can send when the flag is true (manual testing)
 */
export function resolvePushSendConfig(
  env: NodeJS.ProcessEnv = process.env,
): PushSendConfigResult {
  // Exact match only — no trim, no case folding (" true", "TRUE", "1" all fail).
  if (env.PUSH_SENDING_ENABLED !== 'true') {
    return { ok: false, reason: 'disabled' }
  }

  const vercelEnv = env.VERCEL_ENV?.trim()
  if (vercelEnv && vercelEnv !== 'production') {
    return { ok: false, reason: 'disabled' }
  }

  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? ''
  const subject = env.VAPID_SUBJECT?.trim() ?? ''

  if (!publicKey || !privateKey || !subject) {
    return { ok: false, reason: 'incomplete' }
  }

  if (!looksLikeBase64UrlKey(publicKey, 20) || !looksLikeBase64UrlKey(privateKey, 20)) {
    return { ok: false, reason: 'invalid' }
  }

  if (!isValidVapidSubject(subject)) {
    return { ok: false, reason: 'invalid' }
  }

  return { ok: true, publicKey, privateKey, subject }
}

/** Public-safe flag for UI (does not distinguish incomplete vs disabled). */
export function isPushSendingAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolvePushSendConfig(env).ok
}
