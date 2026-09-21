import { ADMIN_FULL_DRY_RUN_COOLDOWN_MS } from '@/lib/admin/notification-test-config'

type DryRunGate =
  | { ok: true }
  | { ok: false; code: 'in_progress' | 'rate_limited'; retryAfterSeconds?: number }

const lastStartedByKey = new Map<string, number>()
const inFlightKeys = new Set<string>()

/** Test-only reset. */
export function resetAdminFullDryRunRateLimitForTests(): void {
  lastStartedByKey.clear()
  inFlightKeys.clear()
}

/**
 * Process-local gate keyed by admin + audience scope (enrolled vs all).
 * Prevents sharing in-flight/cooldown across scopes for the same admin.
 * Does not coordinate across Vercel instances (documented limitation).
 */
export function beginAdminFullDryRun(gateKey: string, nowMs = Date.now()): DryRunGate {
  if (inFlightKeys.has(gateKey)) {
    return { ok: false, code: 'in_progress' }
  }

  const last = lastStartedByKey.get(gateKey)
  if (last != null) {
    const elapsed = nowMs - last
    if (elapsed < ADMIN_FULL_DRY_RUN_COOLDOWN_MS) {
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((ADMIN_FULL_DRY_RUN_COOLDOWN_MS - elapsed) / 1000),
        ),
      }
    }
  }

  inFlightKeys.add(gateKey)
  lastStartedByKey.set(gateKey, nowMs)
  return { ok: true }
}

export function endAdminFullDryRun(gateKey: string): void {
  inFlightKeys.delete(gateKey)
}
