/**
 * Safe notification ops dashboard helpers (no secrets / IDs / endpoints).
 */

export const NOTIFICATION_OPS_PENDING_STALE_MS = 10 * 60 * 1000
export const NOTIFICATION_OPS_SOFT_TIMEOUT_MS = 25_000
export const NOTIFICATION_OPS_RECENT_FAILURE_LIMIT = 20
export const NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT = 1000

/** Code-defined Cron catalog (mirrors vercel.json; not live Vercel API). */
export const NOTIFICATION_OPS_CRONS = [
  {
    id: 'study-digest',
    path: '/api/cron/study-digest',
    scheduleUtc: '0 23 * * *',
    scheduleJstLabel: '毎日 08:00台（JST）',
    note: '最終実行時刻は Vercel Logs で確認',
  },
  {
    id: 'study-reminder',
    path: '/api/cron/study-reminder',
    scheduleUtc: '0 13 * * *',
    scheduleJstLabel: '毎日 22:00台（JST）',
    note: '最終実行時刻は Vercel Logs で確認',
  },
  {
    id: 'coaching-booking-reminder',
    path: '/api/cron/coaching-booking-reminder',
    scheduleUtc: '0 3 * * 1',
    scheduleJstLabel: '月曜 12:00台（JST）',
    note: '最終実行時刻は Vercel Logs で確認',
  },
  {
    id: 'coaching-session-reminder',
    path: '/api/cron/coaching-session-reminder',
    scheduleUtc: '0 11 * * *',
    scheduleJstLabel: '毎日 20:00台（JST）',
    note: '最終実行時刻は Vercel Logs で確認',
  },
] as const

export type ConfiguredFlag = 'configured' | 'missing'

/** Presence only — never expose value, length, or prefix. */
export function envPresence(raw: string | undefined): ConfiguredFlag {
  return typeof raw === 'string' && raw.trim().length > 0 ? 'configured' : 'missing'
}

export function pushSendingFlagLabel(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): 'ON' | 'OFF' {
  return env.PUSH_SENDING_ENABLED === 'true' ? 'ON' : 'OFF'
}

export function adminTestFlagLabel(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): 'ON' | 'OFF' {
  return env.ADMIN_NOTIFICATION_TEST_ENABLED === 'true' ? 'ON' : 'OFF'
}

export type SafeErrorBucket =
  | 'gone_404_410'
  | 'rate_limited_429'
  | 'network'
  | 'provider_error'
  | 'stale_pending'
  | 'other'

/** Map stored error_code / http_status to safe aggregate buckets. */
export function classifySafeDeliveryError(params: {
  status: string
  errorCode: string | null
  httpStatus: number | null
}): SafeErrorBucket | null {
  if (params.status === 'pending' && params.errorCode === 'stale_pending') {
    return 'stale_pending'
  }
  if (params.status !== 'failed') return null

  const code = (params.errorCode ?? '').toLowerCase()
  if (code === 'gone' || params.httpStatus === 404 || params.httpStatus === 410) {
    return 'gone_404_410'
  }
  if (code === 'rate_limited' || params.httpStatus === 429) {
    return 'rate_limited_429'
  }
  if (code === 'network' || code === 'timeout') {
    return 'network'
  }
  if (
    code === 'transient' ||
    code === 'provider_error' ||
    code === 'email_send_failed' ||
    (params.httpStatus != null && params.httpStatus >= 500)
  ) {
    return 'provider_error'
  }
  if (code === 'stale_pending') return 'stale_pending'
  return 'other'
}

/** Allowlist of error codes safe to show in recent-failure cards. */
const SAFE_ERROR_CODES = new Set([
  'gone',
  'transient',
  'client_error',
  'timeout',
  'network',
  'unknown',
  'stale_pending',
  'rate_limited',
  'provider_error',
  'email_send_failed',
  'email_not_configured',
  'no_email',
  'deadline',
])

export function sanitizeErrorCodeForDisplay(raw: string | null): string {
  if (!raw) return 'unknown'
  const trimmed = raw.slice(0, 100)
  if (!SAFE_ERROR_CODES.has(trimmed)) return 'classified_error'
  return trimmed
}
