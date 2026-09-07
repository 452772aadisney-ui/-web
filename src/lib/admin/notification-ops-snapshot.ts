/**
 * Admin notification ops snapshot (counts only, no PII).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { aggregateActivePushRowsForStudents } from '@/lib/admin/push-registration'
import { resolveEffectiveStudyReminderMode } from '@/lib/study/study-reminder-mode'
import { resolveEffectiveAnnouncementMode } from '@/lib/announcements/announcement-delivery-mode'
import { resolveEffectiveMessageMode } from '@/lib/chat/message-delivery-mode'
import { resolveEffectiveCoachingReminderMode } from '@/lib/coaching/coaching-reminder-mode'
import { resolveEffectiveClassScheduleMode } from '@/lib/class-schedule/class-schedule-delivery-mode'
import { parseStudyReminderPushAllowlist } from '@/lib/study/study-reminder-mode'
import { parseAnnouncementPushAllowlist } from '@/lib/announcements/announcement-delivery-mode'
import { parseMessagePushAllowlist } from '@/lib/chat/message-delivery-mode'
import { parseCoachingReminderPushAllowlist } from '@/lib/coaching/coaching-reminder-mode'
import { parseClassSchedulePushAllowlist } from '@/lib/class-schedule/class-schedule-delivery-mode'
import {
  NOTIFICATION_OPS_CRONS,
  NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT,
  NOTIFICATION_OPS_PENDING_STALE_MS,
  NOTIFICATION_OPS_RECENT_FAILURE_LIMIT,
  NOTIFICATION_OPS_SOFT_TIMEOUT_MS,
  adminTestFlagLabel,
  classifySafeDeliveryError,
  envPresence,
  pushSendingFlagLabel,
  sanitizeErrorCodeForDisplay,
  type ConfiguredFlag,
} from '@/lib/admin/notification-ops-config'

export type NotificationOpsEnvStatus = {
  pushSending: 'ON' | 'OFF'
  vapidPublicKey: ConfiguredFlag
  vapidPrivateKey: ConfiguredFlag
  vapidSubject: ConfiguredFlag
  adminTest: 'ON' | 'OFF'
  cronSecret: ConfiguredFlag
  pushSendingAvailable: boolean
}

export type NotificationOpsModeCard = {
  id:
    | 'study_reminder'
    | 'announcement'
    | 'message'
    | 'coaching_reminder'
    | 'class_schedule'
  label: string
  configuredModeRaw: string
  configuredModeValid: boolean
  effectiveMode: string
  allowlistConfigured: boolean
  allowlistCount: number | null
  allowlistInvalid: boolean
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
  pushSending: 'ON' | 'OFF'
  description: string
  warning: string | null
}

export type NotificationOpsSubscriptionAggregate = {
  studentCount: number
  studentsWithActivePush: number
  studentsWithoutActivePush: number
  activeSubscriptionCount: number
  multiDeviceStudentCount: number
  disabledSubscriptionCount: number
  preferenceDisabled: {
    study_reminder: number
    announcement: number
    message: number
    coaching_reminder: number
    class_schedule: number
  }
  possiblyUndeliverable: number
  queryTruncated: boolean
}

export type DeliveryWindowStats = {
  window: '24h' | '7d'
  truncated: boolean
  scannedDeliveries: number
  byType: Record<
    string,
    {
      push: { pending: number; sent: number; failed: number; skipped: number }
      email: { pending: number; sent: number; failed: number; skipped: number }
    }
  >
  errorBuckets: {
    gone_404_410: number
    rate_limited_429: number
    network: number
    provider_error: number
    stale_pending: number
    other: number
  }
}

export type PendingMonitor = {
  freshPending: number
  stalePending: number
  byTypeChannel: Array<{
    notificationType: string
    channel: 'push' | 'email'
    fresh: number
    stale: number
  }>
  truncated: boolean
}

export type RecentFailureRow = {
  occurredAt: string
  notificationType: string
  channel: 'push' | 'email'
  errorCode: string
  /** Safe metadata.source only (e.g. admin_notification_ops). Never PII. */
  source: string | null
  /** Safe metadata.kind only. */
  kind: string | null
}

export type NotificationOpsSnapshot = {
  evaluatedAt: string
  durationMs: number
  timedOut: boolean
  env: NotificationOpsEnvStatus
  modes: NotificationOpsModeCard[]
  subscriptions: NotificationOpsSubscriptionAggregate | null
  subscriptionsError: boolean
  deliveries24h: DeliveryWindowStats | null
  deliveries7d: DeliveryWindowStats | null
  deliveriesError: boolean
  pending: PendingMonitor | null
  pendingError: boolean
  recentFailures: RecentFailureRow[]
  recentFailuresError: boolean
  crons: typeof NOTIFICATION_OPS_CRONS
  recoveryHints: string[]
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

function emptyChannel() {
  return { pending: 0, sent: 0, failed: 0, skipped: 0 }
}

function ensureTypeBucket(
  map: DeliveryWindowStats['byType'],
  type: string,
) {
  if (!map[type]) {
    map[type] = { push: emptyChannel(), email: emptyChannel() }
  }
  return map[type]!
}

function buildEnvStatus(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): NotificationOpsEnvStatus {
  return {
    pushSending: pushSendingFlagLabel(env),
    vapidPublicKey: envPresence(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivateKey: envPresence(env.VAPID_PRIVATE_KEY),
    vapidSubject: envPresence(env.VAPID_SUBJECT),
    adminTest: adminTestFlagLabel(env),
    cronSecret: envPresence(env.CRON_SECRET),
    pushSendingAvailable: isPushSendingAvailable(env),
  }
}

function buildModeCards(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): NotificationOpsModeCard[] {
  const pushSending = pushSendingFlagLabel(env)

  const studyRaw = env.STUDY_REMINDER_DELIVERY_MODE ?? ''
  const study = resolveEffectiveStudyReminderMode(env)
  const studyAllow = parseStudyReminderPushAllowlist(env.STUDY_REMINDER_PUSH_ALLOWLIST)
  const studyValid =
    studyRaw === 'legacy' ||
    studyRaw === 'dry-run' ||
    studyRaw === 'allowlist' ||
    studyRaw === 'all' ||
    studyRaw === ''

  const annRaw = env.ANNOUNCEMENT_DELIVERY_MODE ?? ''
  const ann = resolveEffectiveAnnouncementMode(env)
  const annAllow = parseAnnouncementPushAllowlist(env.ANNOUNCEMENT_PUSH_ALLOWLIST)
  const annValid =
    annRaw === 'legacy' ||
    annRaw === 'dry-run' ||
    annRaw === 'allowlist' ||
    annRaw === 'all' ||
    annRaw === ''

  const msgRaw = env.MESSAGE_DELIVERY_MODE ?? ''
  const msg = resolveEffectiveMessageMode(env)
  const msgAllow = parseMessagePushAllowlist(env.MESSAGE_PUSH_ALLOWLIST)
  const msgValid =
    msgRaw === 'legacy' ||
    msgRaw === 'dry-run' ||
    msgRaw === 'allowlist' ||
    msgRaw === 'all' ||
    msgRaw === ''

  const coachRaw = env.COACHING_REMINDER_DELIVERY_MODE ?? ''
  const coach = resolveEffectiveCoachingReminderMode(env)
  const coachAllow = parseCoachingReminderPushAllowlist(env.COACHING_REMINDER_PUSH_ALLOWLIST)
  const coachValid =
    coachRaw === 'legacy' ||
    coachRaw === 'dry-run' ||
    coachRaw === 'allowlist' ||
    coachRaw === 'all' ||
    coachRaw === ''

  const classRaw = env.CLASS_SCHEDULE_DELIVERY_MODE ?? ''
  const classMode = resolveEffectiveClassScheduleMode(env)
  const classAllow = parseClassSchedulePushAllowlist(env.CLASS_SCHEDULE_PUSH_ALLOWLIST)
  const classValid =
    classRaw === 'legacy' ||
    classRaw === 'dry-run' ||
    classRaw === 'allowlist' ||
    classRaw === 'all' ||
    classRaw === ''

  function warn(
    configuredValid: boolean,
    forced: 'allowlist_empty' | 'allowlist_invalid' | null,
    raw: string,
  ): string | null {
    if (!configuredValid && raw !== '') {
      return '設定値が不正のため、実コードは legacy にfallbackしています。'
    }
    if (forced === 'allowlist_empty') {
      return 'allowlist が空のため、実コードは legacy にfallbackしています。'
    }
    if (forced === 'allowlist_invalid') {
      return 'allowlist が不正のため、実コードは legacy にfallbackしています。'
    }
    return null
  }

  return [
    {
      id: 'study_reminder',
      label: '学習記録リマインダー',
      configuredModeRaw: studyRaw === '' ? '(未設定→legacy)' : studyRaw,
      configuredModeValid: studyValid,
      effectiveMode: study.mode,
      allowlistConfigured: studyAllow.ok,
      allowlistCount: studyAllow.ok ? studyAllow.ids.size : null,
      allowlistInvalid: !studyAllow.ok && studyAllow.reason === 'invalid',
      forcedLegacyReason: study.forcedLegacyReason,
      pushSending,
      description:
        '未記録生徒への22:00台リマインダー。legacyは従来メール、allはPush-first。',
      warning: warn(studyValid, study.forcedLegacyReason, studyRaw),
    },
    {
      id: 'announcement',
      label: '新しいお知らせ',
      configuredModeRaw: annRaw === '' ? '(未設定→legacy)' : annRaw,
      configuredModeValid: annValid,
      effectiveMode: ann.mode,
      allowlistConfigured: annAllow.ok,
      allowlistCount: annAllow.ok ? annAllow.ids.size : null,
      allowlistInvalid: !annAllow.ok && annAllow.reason === 'invalid',
      forcedLegacyReason: ann.forcedLegacyReason,
      pushSending,
      description: 'お知らせ公開時の生徒向け通知。管理者停止でPush・メール両方停止。',
      warning: warn(annValid, ann.forcedLegacyReason, annRaw),
    },
    {
      id: 'message',
      label: '新しいメッセージ',
      configuredModeRaw: msgRaw === '' ? '(未設定→legacy)' : msgRaw,
      configuredModeValid: msgValid,
      effectiveMode: msg.mode,
      allowlistConfigured: msgAllow.ok,
      allowlistCount: msgAllow.ok ? msgAllow.ids.size : null,
      allowlistInvalid: !msgAllow.ok && msgAllow.reason === 'invalid',
      forcedLegacyReason: msg.forcedLegacyReason,
      pushSending,
      description:
        '管理者→生徒の通常メッセージのみ。coaching_booking_reminderは除外。',
      warning: warn(msgValid, msg.forcedLegacyReason, msgRaw),
    },
    {
      id: 'coaching_reminder',
      label: 'コーチングのお知らせ',
      configuredModeRaw: coachRaw === '' ? '(未設定→legacy)' : coachRaw,
      configuredModeValid: coachValid,
      effectiveMode: coach.mode,
      allowlistConfigured: coachAllow.ok,
      allowlistCount: coachAllow.ok ? coachAllow.ids.size : null,
      allowlistInvalid: !coachAllow.ok && coachAllow.reason === 'invalid',
      forcedLegacyReason: coach.forcedLegacyReason,
      pushSending,
      description:
        '週次予約催促と予約前日案内。legacyは週次チャットのみ・前日は送信なし。',
      warning: warn(coachValid, coach.forcedLegacyReason, coachRaw),
    },
    {
      id: 'class_schedule',
      label: '授業予定',
      configuredModeRaw: classRaw === '' ? '(未設定→legacy)' : classRaw,
      configuredModeValid: classValid,
      effectiveMode: classMode.mode,
      allowlistConfigured: classAllow.ok,
      allowlistCount: classAllow.ok ? classAllow.ids.size : null,
      allowlistInvalid: !classAllow.ok && classAllow.reason === 'invalid',
      forcedLegacyReason: classMode.forcedLegacyReason,
      pushSending,
      description:
        '既卒生向け授業予定の登録・変更・中止。legacyはメールのみ、allはPush-first。',
      warning: warn(classValid, classMode.forcedLegacyReason, classRaw),
    },
  ]
}

async function loadSubscriptionAggregate(
  admin: AdminClient,
): Promise<NotificationOpsSubscriptionAggregate> {
  const { data: students, error: studentsError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'student')
    .limit(NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT)

  if (studentsError) throw new Error('students')

  const studentRows = (students ?? []) as Array<{ id: string; email: string | null }>
  const queryTruncated = studentRows.length >= NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT
  const studentIds = studentRows.map((s) => s.id)
  const emailById = new Map(
    studentRows.map((s) => [s.id, Boolean(s.email?.trim())] as const),
  )

  const { data: activeSubs, error: activeError } = await admin
    .from('push_subscriptions')
    .select('id, user_id')
    .is('disabled_at', null)
    .limit(NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT)

  if (activeError) throw new Error('active_subs')

  const { count: disabledCount, error: disabledError } = await admin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .not('disabled_at', 'is', null)

  if (disabledError) throw new Error('disabled_subs')

  const activeRows = (activeSubs ?? []) as Array<{ id: string; user_id: string }>
  const activeTruncated = activeRows.length >= NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT
  const aggregated = aggregateActivePushRowsForStudents(
    studentIds,
    activeRows.map((row) => ({ user_id: row.user_id })),
  )
  const {
    studentsWithActivePush,
    studentsWithoutActivePush,
    activeSubscriptionCount,
    multiDeviceStudentCount,
  } = aggregated

  const preferenceDisabled = {
    study_reminder: 0,
    announcement: 0,
    message: 0,
    coaching_reminder: 0,
    class_schedule: 0,
  }

  if (studentIds.length > 0) {
    const { data: prefs, error: prefError } = await admin
      .from('notification_preferences')
      .select(
        'user_id, study_reminder, announcement, message, coaching_reminder, class_schedule',
      )
      .in('user_id', studentIds)

    if (prefError) throw new Error('prefs')

    for (const row of (prefs ?? []) as Array<{
      study_reminder: boolean
      announcement: boolean
      message: boolean
      coaching_reminder: boolean
      class_schedule: boolean
    }>) {
      if (!row.study_reminder) preferenceDisabled.study_reminder += 1
      if (!row.announcement) preferenceDisabled.announcement += 1
      if (!row.message) preferenceDisabled.message += 1
      if (!row.coaching_reminder) preferenceDisabled.coaching_reminder += 1
      if (!row.class_schedule) preferenceDisabled.class_schedule += 1
    }
  }

  let possiblyUndeliverable = 0
  for (const id of studentIds) {
    const hasPush = (aggregated.countsByUserId.get(id) ?? 0) > 0
    const hasEmail = emailById.get(id) ?? false
    if (!hasPush && !hasEmail) possiblyUndeliverable += 1
  }

  return {
    studentCount: studentIds.length,
    studentsWithActivePush,
    studentsWithoutActivePush,
    // Row count from the (possibly truncated) active scan — same as before.
    activeSubscriptionCount: activeRows.length,
    multiDeviceStudentCount,
    disabledSubscriptionCount: disabledCount ?? 0,
    preferenceDisabled,
    possiblyUndeliverable,
    queryTruncated: queryTruncated || activeTruncated,
  }
}

type DeliveryScanRow = {
  channel: 'push' | 'email'
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  error_code: string | null
  http_status: number | null
  created_at: string
  sent_at: string | null
  notification_events: { notification_type: string } | { notification_type: string }[] | null
}

function eventTypeOf(row: DeliveryScanRow): string {
  const ev = row.notification_events
  if (!ev) return 'unknown'
  const obj = Array.isArray(ev) ? ev[0] : ev
  return obj?.notification_type ?? 'unknown'
}

async function scanDeliveriesWindow(
  admin: AdminClient,
  window: '24h' | '7d',
  sinceIso: string,
): Promise<DeliveryWindowStats> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select(
      'channel, status, error_code, http_status, created_at, sent_at, notification_events!inner(notification_type)',
    )
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT)

  if (error) throw new Error('deliveries')

  const rows = (data ?? []) as DeliveryScanRow[]
  const stats: DeliveryWindowStats = {
    window,
    truncated: rows.length >= NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT,
    scannedDeliveries: rows.length,
    byType: {},
    errorBuckets: {
      gone_404_410: 0,
      rate_limited_429: 0,
      network: 0,
      provider_error: 0,
      stale_pending: 0,
      other: 0,
    },
  }

  for (const row of rows) {
    const type = eventTypeOf(row)
    const bucket = ensureTypeBucket(stats.byType, type)
    const channel = row.channel === 'email' ? 'email' : 'push'
    const status = row.status
    if (status === 'pending' || status === 'sent' || status === 'failed' || status === 'skipped') {
      bucket[channel][status] += 1
    }

    const err = classifySafeDeliveryError({
      status: row.status,
      errorCode: row.error_code,
      httpStatus: row.http_status,
    })
    if (err) stats.errorBuckets[err] += 1
  }

  return stats
}

async function loadPendingMonitor(
  admin: AdminClient,
  nowMs: number,
): Promise<PendingMonitor> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select(
      'channel, status, created_at, sent_at, notification_events!inner(notification_type)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT)

  if (error) throw new Error('pending')

  const rows = (data ?? []) as Array<{
    channel: 'push' | 'email'
    created_at: string
    sent_at: string | null
    notification_events: { notification_type: string } | { notification_type: string }[] | null
  }>

  const map = new Map<string, { fresh: number; stale: number }>()
  let freshPending = 0
  let stalePending = 0

  for (const row of rows) {
    const type = (() => {
      const ev = row.notification_events
      if (!ev) return 'unknown'
      const obj = Array.isArray(ev) ? ev[0] : ev
      return obj?.notification_type ?? 'unknown'
    })()
    const channel = row.channel === 'email' ? 'email' : 'push'
    const anchor = Date.parse(row.sent_at ?? row.created_at)
    const age = Number.isFinite(anchor) ? nowMs - anchor : 0
    const stale = age >= NOTIFICATION_OPS_PENDING_STALE_MS
    if (stale) stalePending += 1
    else freshPending += 1

    const key = `${type}:${channel}`
    const cur = map.get(key) ?? { fresh: 0, stale: 0 }
    if (stale) cur.stale += 1
    else cur.fresh += 1
    map.set(key, cur)
  }

  return {
    freshPending,
    stalePending,
    byTypeChannel: [...map.entries()].map(([key, v]) => {
      const [notificationType, channel] = key.split(':')
      return {
        notificationType: notificationType ?? 'unknown',
        channel: (channel === 'email' ? 'email' : 'push') as 'push' | 'email',
        fresh: v.fresh,
        stale: v.stale,
      }
    }),
    truncated: rows.length >= NOTIFICATION_OPS_DELIVERY_SCAN_LIMIT,
  }
}

async function loadRecentFailures(admin: AdminClient): Promise<RecentFailureRow[]> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select(
      'channel, error_code, created_at, notification_events!inner(notification_type, metadata)',
    )
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_OPS_RECENT_FAILURE_LIMIT)

  if (error) throw new Error('failures')

  return ((data ?? []) as Array<{
    channel: 'push' | 'email'
    error_code: string | null
    created_at: string
    notification_events:
      | { notification_type: string; metadata: Record<string, unknown> | null }
      | Array<{ notification_type: string; metadata: Record<string, unknown> | null }>
      | null
  }>).map((row) => {
    const ev = row.notification_events
    const obj = Array.isArray(ev) ? ev[0] : ev
    const meta = obj?.metadata
    const source =
      meta && typeof meta === 'object' && typeof meta.source === 'string'
        ? meta.source
        : null
    const kind =
      meta && typeof meta === 'object' && typeof meta.kind === 'string' ? meta.kind : null
    return {
      occurredAt: row.created_at,
      notificationType: obj?.notification_type ?? 'unknown',
      channel: row.channel === 'email' ? 'email' : 'push',
      errorCode: sanitizeErrorCodeForDisplay(row.error_code),
      source,
      kind,
    }
  })
}

export async function loadNotificationOpsSnapshot(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
  nowMs?: number
}): Promise<
  | { ok: true; snapshot: NotificationOpsSnapshot }
  | { ok: false; code: 'admin_unavailable' }
> {
  const startedAt = params?.nowMs ?? Date.now()
  const deadline = startedAt + NOTIFICATION_OPS_SOFT_TIMEOUT_MS
  const env = params?.env ?? process.env

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const snapshot: NotificationOpsSnapshot = {
    evaluatedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    timedOut: false,
    env: buildEnvStatus(env),
    modes: buildModeCards(env),
    subscriptions: null,
    subscriptionsError: false,
    deliveries24h: null,
    deliveries7d: null,
    deliveriesError: false,
    pending: null,
    pendingError: false,
    recentFailures: [],
    recentFailuresError: false,
    crons: NOTIFICATION_OPS_CRONS,
    recoveryHints: [
      '問題時は該当カテゴリの DELIVERY_MODE を legacy に戻す（コードrollback不要）。',
      'Pushを全停止する場合は PUSH_SENDING_ENABLED を true 以外にする。',
      '404/410 は購読失効として記録される。再購読は生徒端末側。',
      '429 は自動再送しない。pace間隔と Resend 上限を確認。',
      '10分超の pending は要確認（この画面から自動再送しない）。',
      'Cronの最終実行は Vercel Logs で確認（推測表示しない）。',
      '秘密情報・allowlist ID・endpointをチャットやチケットに貼らない。',
    ],
  }

  const pastDeadline = () => Date.now() >= deadline

  try {
    if (!pastDeadline()) {
      snapshot.subscriptions = await loadSubscriptionAggregate(admin)
    } else {
      snapshot.timedOut = true
    }
  } catch {
    snapshot.subscriptionsError = true
  }

  try {
    if (!pastDeadline()) {
      const since24 = new Date(startedAt - 24 * 60 * 60 * 1000).toISOString()
      snapshot.deliveries24h = await scanDeliveriesWindow(admin, '24h', since24)
    } else {
      snapshot.timedOut = true
    }
  } catch {
    snapshot.deliveriesError = true
  }

  try {
    if (!pastDeadline()) {
      const since7 = new Date(startedAt - 7 * 24 * 60 * 60 * 1000).toISOString()
      snapshot.deliveries7d = await scanDeliveriesWindow(admin, '7d', since7)
    } else {
      snapshot.timedOut = true
    }
  } catch {
    snapshot.deliveriesError = true
  }

  try {
    if (!pastDeadline()) {
      snapshot.pending = await loadPendingMonitor(admin, startedAt)
    } else {
      snapshot.timedOut = true
    }
  } catch {
    snapshot.pendingError = true
  }

  try {
    if (!pastDeadline()) {
      snapshot.recentFailures = await loadRecentFailures(admin)
    } else {
      snapshot.timedOut = true
    }
  } catch {
    snapshot.recentFailuresError = true
  }

  snapshot.durationMs = Date.now() - startedAt
  return { ok: true, snapshot }
}
