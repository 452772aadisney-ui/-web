/**
 * Admin notification test feature flags / allowlist (server-only).
 * Never log allowlist contents or commit real user IDs.
 */

export const ADMIN_NOTIFICATION_TEST_COOLDOWN_MS = 30_000

export const ADMIN_TEST_PUSH_TITLE = '受験生web'
export const ADMIN_TEST_PUSH_BODY = '学習記録リマインダーのテスト通知です。'
export const ADMIN_TEST_PUSH_PATH = '/dashboard/study'

export const ADMIN_TEST_EMAIL_SUBJECT =
  '【受験生web】【テスト】学習記録リマインダーの確認'
export const ADMIN_TEST_EMAIL_BODY = [
  'これは管理者による通知テストです。',
  '学習記録リマインダーのメール配信経路を確認しています。',
  '',
  '一般の生徒向け通知ではありません。',
].join('\n')

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type NotificationTestAllowlistResult =
  | { ok: true; ids: ReadonlySet<string> }
  | { ok: false; reason: 'empty' | 'invalid' }

/** Exact string true only. */
export function isAdminNotificationTestEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.ADMIN_NOTIFICATION_TEST_ENABLED === 'true'
}

/**
 * Comma-separated profile UUIDs. Any malformed token disables the feature.
 * Empty / unset → empty failure.
 */
export function parseNotificationTestUserIds(
  raw: string | undefined = process.env.NOTIFICATION_TEST_USER_IDS,
): NotificationTestAllowlistResult {
  if (raw == null || raw.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  const ids = new Set<string>()
  for (const token of raw.split(',')) {
    if (token.length === 0) continue
    if (!UUID_RE.test(token)) {
      return { ok: false, reason: 'invalid' }
    }
    ids.add(token.toLowerCase())
  }

  if (ids.size === 0) {
    return { ok: false, reason: 'empty' }
  }

  return { ok: true, ids }
}

export type AdminNotificationTestAvailability =
  | { available: true; allowlist: ReadonlySet<string> }
  | {
      available: false
      reason: 'flag_off' | 'allowlist_empty' | 'allowlist_invalid'
    }

export function resolveAdminNotificationTestAvailability(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AdminNotificationTestAvailability {
  if (!isAdminNotificationTestEnabled(env)) {
    return { available: false, reason: 'flag_off' }
  }

  const parsed = parseNotificationTestUserIds(env.NOTIFICATION_TEST_USER_IDS)
  if (!parsed.ok) {
    return {
      available: false,
      reason: parsed.reason === 'empty' ? 'allowlist_empty' : 'allowlist_invalid',
    }
  }

  return { available: true, allowlist: parsed.ids }
}

export function buildAdminTestIdempotencyKey(params: {
  kind: 'push' | 'email'
  adminUserId: string
  targetUserId: string
  nowMs?: number
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const bucket = Math.floor(nowMs / ADMIN_NOTIFICATION_TEST_COOLDOWN_MS)
  return `admin-test:${params.kind}:${params.adminUserId}:${params.targetUserId}:${bucket}`
}
