/** Announcement notification delivery mode and allowlist (server-only). */

export const ANNOUNCEMENT_DELIVERY_MODES = [
  'legacy',
  'dry-run',
  'allowlist',
  'all',
] as const

export type AnnouncementDeliveryMode = (typeof ANNOUNCEMENT_DELIVERY_MODES)[number]

export const ANNOUNCEMENT_PENDING_STALE_MS = 10 * 60 * 1000

/** Bounded student-level concurrency for the Push-first path. */
export const ANNOUNCEMENT_STUDENT_CONCURRENCY = 3

/**
 * Soft budget for admin create Server Action (~28 recipients today).
 * Page may also set maxDuration = 60.
 */
export const ANNOUNCEMENT_SOFT_TIMEOUT_RESERVE_MS = 5_000
export const ANNOUNCEMENT_ROUTE_MAX_DURATION_SECONDS = 60

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Exact-match mode. Unset / empty / invalid → legacy.
 * No trim, no case folding.
 */
export function resolveAnnouncementDeliveryMode(
  raw: string | undefined = process.env.ANNOUNCEMENT_DELIVERY_MODE,
): AnnouncementDeliveryMode {
  if (raw === 'legacy' || raw === 'dry-run' || raw === 'allowlist' || raw === 'all') {
    return raw
  }
  return 'legacy'
}

export type AnnouncementAllowlistResult =
  | { ok: true; ids: ReadonlySet<string> }
  | { ok: false; reason: 'empty' | 'invalid' }

/**
 * Comma-separated UUIDs. Empty → empty failure.
 * Any malformed token → invalid (caller should fall back to legacy).
 * Never log the contents.
 */
export function parseAnnouncementPushAllowlist(
  raw: string | undefined = process.env.ANNOUNCEMENT_PUSH_ALLOWLIST,
): AnnouncementAllowlistResult {
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

/**
 * Effective mode after allowlist validation.
 * allowlist with empty/invalid list → legacy.
 */
export function resolveEffectiveAnnouncementMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): {
  mode: AnnouncementDeliveryMode
  allowlist: ReadonlySet<string> | null
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
} {
  const configured = resolveAnnouncementDeliveryMode(env.ANNOUNCEMENT_DELIVERY_MODE)

  if (configured !== 'allowlist') {
    return { mode: configured, allowlist: null, forcedLegacyReason: null }
  }

  const parsed = parseAnnouncementPushAllowlist(env.ANNOUNCEMENT_PUSH_ALLOWLIST)
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

export function announcementSoftDeadlineMs(
  startedAtMs: number,
  maxDurationSeconds = ANNOUNCEMENT_ROUTE_MAX_DURATION_SECONDS,
  reserveMs = ANNOUNCEMENT_SOFT_TIMEOUT_RESERVE_MS,
): number {
  return startedAtMs + maxDurationSeconds * 1000 - reserveMs
}
