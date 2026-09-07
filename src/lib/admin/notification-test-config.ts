/**
 * Admin notification test feature flags / allowlist (server-only).
 * Never log allowlist contents or commit real user IDs.
 */

export const ADMIN_NOTIFICATION_TEST_COOLDOWN_MS = 30_000

/** Admin full dry-run cooldown (process-local; not cross-instance). */
export const ADMIN_FULL_DRY_RUN_COOLDOWN_MS = 60_000

/** Study-reminder integration test cooldown (DB idempotency bucket). */
export const ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS = 30_000

/** Coaching reminder integration test cooldown (DB idempotency bucket). */
export const ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS = 60_000

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

/** Fixed category fixtures for comprehensive admin tests (notification_type=test only). */
export const ADMIN_CATEGORY_TEST_KINDS = [
  'study_reminder',
  'announcement',
  'message',
  'coaching_booking_prompt',
  'coaching_session_previous_day',
  'class_schedule',
] as const

export type AdminCategoryTestKind = (typeof ADMIN_CATEGORY_TEST_KINDS)[number]

export type AdminCategoryTestFixture = {
  kind: AdminCategoryTestKind
  label: string
  pushBody: string
  targetPath: string
  emailSubject: string
  emailBody: string
}

export const ADMIN_CATEGORY_TEST_FIXTURES: Record<
  AdminCategoryTestKind,
  AdminCategoryTestFixture
> = {
  study_reminder: {
    kind: 'study_reminder',
    label: '学習記録',
    pushBody: '学習記録リマインダーのテスト通知です。',
    targetPath: '/dashboard/study',
    emailSubject: '【受験生web】【テスト】学習記録リマインダーの確認',
    emailBody: [
      'これは管理者による通知テストです。',
      '学習記録リマインダーのメール配信経路を確認しています。',
      '',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
  announcement: {
    kind: 'announcement',
    label: 'お知らせ',
    pushBody: '新しいお知らせのテスト通知です。',
    targetPath: '/dashboard/announcements',
    emailSubject: '【受験生web】【テスト】お知らせ通知の確認',
    emailBody: [
      'これは管理者による通知テストです。',
      'お知らせ通知のメール配信経路を確認しています。',
      '',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
  message: {
    kind: 'message',
    label: 'メッセージ',
    pushBody: '新しいメッセージのテスト通知です。',
    targetPath: '/dashboard/chat/room',
    emailSubject: '【受験生web】【テスト】メッセージ通知の確認',
    emailBody: [
      'これは管理者による通知テストです。',
      'メッセージ通知のメール配信経路を確認しています。',
      '',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
  coaching_booking_prompt: {
    kind: 'coaching_booking_prompt',
    label: 'コーチング予約催促',
    pushBody: '今週のコーチング予約催促のテスト通知です。',
    targetPath: '/dashboard/coaching',
    emailSubject: '【受験生web】【テスト】コーチング予約催促の確認',
    emailBody: [
      'これは管理者による通知テストです。',
      'コーチング予約催促のメール配信経路を確認しています。',
      '',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
  coaching_session_previous_day: {
    kind: 'coaching_session_previous_day',
    label: 'コーチング前日案内',
    pushBody: '明日20:30からコーチングです。（テスト）',
    targetPath: '/dashboard/coaching',
    emailSubject: '【受験生web】【テスト】コーチング前日案内の確認',
    emailBody: [
      'これは管理者による通知テストです。',
      '明日20:30からコーチングです。（テスト）',
      '',
      '実予約データは作成・変更していません。',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
  class_schedule: {
    kind: 'class_schedule',
    label: '授業予定',
    pushBody: '新しい授業予定が登録されました。（テスト）',
    targetPath: '/dashboard/class-schedule',
    emailSubject: '【受験生web】【テスト】授業予定通知の確認',
    emailBody: [
      'これは管理者による通知テストです。',
      '授業予定通知のメール配信経路を確認しています。',
      '',
      '一般の生徒向け通知ではありません。',
    ].join('\n'),
  },
}

export function resolveAdminCategoryTestKind(
  raw: unknown,
): AdminCategoryTestKind | null {
  if (typeof raw !== 'string') return null
  return (ADMIN_CATEGORY_TEST_KINDS as readonly string[]).includes(raw)
    ? (raw as AdminCategoryTestKind)
    : null
}

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
  /** Category fixture key; defaults to study_reminder for legacy actions. */
  category?: AdminCategoryTestKind
  nowMs?: number
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const bucket = Math.floor(nowMs / ADMIN_NOTIFICATION_TEST_COOLDOWN_MS)
  const category = params.category ?? 'study_reminder'
  return `admin-test:${category}:${params.kind}:${params.adminUserId}:${params.targetUserId}:${bucket}`
}

/**
 * Distinct from Cron daily key (JST date). Never log / return the target id to clients.
 */
export function buildAdminStudyReminderIntegrationIdempotencyKey(params: {
  targetUserId: string
  nowMs?: number
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const bucket = Math.floor(
    nowMs / ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS,
  )
  return `admin-study-reminder-test:${params.targetUserId.toLowerCase()}:${bucket}`
}

/** Distinct from Cron `booking-prompt:YYYY-MM-DD`. Never return to clients. */
export function buildAdminCoachingBookingPromptIntegrationIdempotencyKey(params: {
  targetUserId: string
  nowMs?: number
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const bucket = Math.floor(nowMs / ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS)
  return `admin-coaching-booking-prompt-test:${params.targetUserId.toLowerCase()}:${bucket}`
}

/** Distinct from Cron `session-previous-day:{bookingId}:{startsAt}`. Never return to clients. */
export function buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey(params: {
  bookingId: string
  normalizedStartAt: string
  nowMs?: number
}): string {
  const nowMs = params.nowMs ?? Date.now()
  const bucket = Math.floor(nowMs / ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS)
  return `admin-coaching-session-previous-day-test:${params.bookingId}:${params.normalizedStartAt}:${bucket}`
}
