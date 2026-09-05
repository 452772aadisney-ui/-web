/** Coaching reminder delivery mode and allowlist (server-only). */

export const COACHING_REMINDER_DELIVERY_MODES = [
  'legacy',
  'dry-run',
  'allowlist',
  'all',
] as const

export type CoachingReminderDeliveryMode =
  (typeof COACHING_REMINDER_DELIVERY_MODES)[number]

export const COACHING_REMINDER_PENDING_STALE_MS = 10 * 60 * 1000
export const COACHING_REMINDER_STUDENT_CONCURRENCY = 3
export const COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS = 60
export const COACHING_REMINDER_SOFT_TIMEOUT_RESERVE_MS = 5_000

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function resolveCoachingReminderDeliveryMode(
  raw: string | undefined = process.env.COACHING_REMINDER_DELIVERY_MODE,
): CoachingReminderDeliveryMode {
  if (raw === 'legacy' || raw === 'dry-run' || raw === 'allowlist' || raw === 'all') {
    return raw
  }
  return 'legacy'
}

export type CoachingReminderAllowlistResult =
  | { ok: true; ids: ReadonlySet<string> }
  | { ok: false; reason: 'empty' | 'invalid' }

export function parseCoachingReminderPushAllowlist(
  raw: string | undefined = process.env.COACHING_REMINDER_PUSH_ALLOWLIST,
): CoachingReminderAllowlistResult {
  if (raw == null || raw.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  const tokens = raw.split(',')
  const ids = new Set<string>()

  for (const token of tokens) {
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

export function resolveEffectiveCoachingReminderMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): {
  mode: CoachingReminderDeliveryMode
  allowlist: ReadonlySet<string> | null
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
} {
  const configured = resolveCoachingReminderDeliveryMode(
    env.COACHING_REMINDER_DELIVERY_MODE,
  )

  if (configured !== 'allowlist') {
    return { mode: configured, allowlist: null, forcedLegacyReason: null }
  }

  const parsed = parseCoachingReminderPushAllowlist(env.COACHING_REMINDER_PUSH_ALLOWLIST)
  if (!parsed.ok) {
    return {
      mode: 'legacy',
      allowlist: null,
      forcedLegacyReason:
        parsed.reason === 'empty' ? 'allowlist_empty' : 'allowlist_invalid',
    }
  }

  return { mode: 'allowlist', allowlist: parsed.ids, forcedLegacyReason: null }
}

export function coachingReminderSoftDeadlineMs(
  startedAtMs: number,
  maxDurationSeconds = COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS,
  reserveMs = COACHING_REMINDER_SOFT_TIMEOUT_RESERVE_MS,
): number {
  return startedAtMs + maxDurationSeconds * 1000 - reserveMs
}
