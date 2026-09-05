/** Message notification delivery mode and allowlist (server-only). */

export const MESSAGE_DELIVERY_MODES = [
  'legacy',
  'dry-run',
  'allowlist',
  'all',
] as const

export type MessageDeliveryMode = (typeof MESSAGE_DELIVERY_MODES)[number]

export const MESSAGE_PENDING_STALE_MS = 10 * 60 * 1000

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Exact-match mode. Unset / empty / invalid → legacy.
 * No trim, no case folding.
 */
export function resolveMessageDeliveryMode(
  raw: string | undefined = process.env.MESSAGE_DELIVERY_MODE,
): MessageDeliveryMode {
  if (raw === 'legacy' || raw === 'dry-run' || raw === 'allowlist' || raw === 'all') {
    return raw
  }
  return 'legacy'
}

export type MessageAllowlistResult =
  | { ok: true; ids: ReadonlySet<string> }
  | { ok: false; reason: 'empty' | 'invalid' }

/**
 * Comma-separated UUIDs. Empty → empty failure.
 * Any malformed token → invalid (caller should fall back to legacy).
 * Never log the contents.
 */
export function parseMessagePushAllowlist(
  raw: string | undefined = process.env.MESSAGE_PUSH_ALLOWLIST,
): MessageAllowlistResult {
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
export function resolveEffectiveMessageMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): {
  mode: MessageDeliveryMode
  allowlist: ReadonlySet<string> | null
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
} {
  const configured = resolveMessageDeliveryMode(env.MESSAGE_DELIVERY_MODE)

  if (configured !== 'allowlist') {
    return { mode: configured, allowlist: null, forcedLegacyReason: null }
  }

  const parsed = parseMessagePushAllowlist(env.MESSAGE_PUSH_ALLOWLIST)
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
