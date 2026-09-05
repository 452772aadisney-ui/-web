/** Study-reminder delivery mode and allowlist parsing (server-only). */

export const STUDY_REMINDER_DELIVERY_MODES = [
  'legacy',
  'dry-run',
  'allowlist',
  'all',
] as const

export type StudyReminderDeliveryMode = (typeof STUDY_REMINDER_DELIVERY_MODES)[number]

export const STUDY_REMINDER_PENDING_STALE_MS = 10 * 60 * 1000

/** Bounded student-level concurrency for the new delivery path. */
export const STUDY_REMINDER_STUDENT_CONCURRENCY = 3

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Exact-match mode. Unset / empty / invalid → legacy.
 * No trim, no case folding.
 */
export function resolveStudyReminderDeliveryMode(
  raw: string | undefined = process.env.STUDY_REMINDER_DELIVERY_MODE,
): StudyReminderDeliveryMode {
  if (raw === 'legacy' || raw === 'dry-run' || raw === 'allowlist' || raw === 'all') {
    return raw
  }
  return 'legacy'
}

export type StudyReminderAllowlistResult =
  | { ok: true; ids: ReadonlySet<string> }
  | { ok: false; reason: 'empty' | 'invalid' }

/**
 * Comma-separated UUIDs. Empty → empty failure.
 * Any malformed token → invalid (caller should fall back to legacy).
 * Never log the contents.
 */
export function parseStudyReminderPushAllowlist(
  raw: string | undefined = process.env.STUDY_REMINDER_PUSH_ALLOWLIST,
): StudyReminderAllowlistResult {
  if (raw == null || raw.length === 0) {
    return { ok: false, reason: 'empty' }
  }

  const tokens = raw.split(',')
  const ids = new Set<string>()

  for (const token of tokens) {
    if (token.length === 0) continue
    // Reject whitespace-padded values (exact UUID only).
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

/**
 * Effective mode after allowlist validation.
 * allowlist with empty/invalid list → legacy.
 */
export function resolveEffectiveStudyReminderMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): {
  mode: StudyReminderDeliveryMode
  allowlist: ReadonlySet<string> | null
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
} {
  const configured = resolveStudyReminderDeliveryMode(env.STUDY_REMINDER_DELIVERY_MODE)

  if (configured !== 'allowlist') {
    return { mode: configured, allowlist: null, forcedLegacyReason: null }
  }

  const parsed = parseStudyReminderPushAllowlist(env.STUDY_REMINDER_PUSH_ALLOWLIST)
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

/** True when running on a Vercel non-production deployment. */
export function isVercelNonProduction(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const vercelEnv = env.VERCEL_ENV
  return Boolean(vercelEnv && vercelEnv !== 'production')
}
