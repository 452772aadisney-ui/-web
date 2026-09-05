import { ADMIN_FULL_DRY_RUN_COOLDOWN_MS } from '@/lib/admin/notification-test-config'

type DryRunGate =
  | { ok: true }
  | { ok: false; code: 'in_progress' | 'rate_limited'; retryAfterSeconds?: number }

const lastStartedByAdmin = new Map<string, number>()
const inFlightAdmins = new Set<string>()

/** Test-only reset. */
export function resetAdminFullDryRunRateLimitForTests(): void {
  lastStartedByAdmin.clear()
  inFlightAdmins.clear()
}

/**
 * Process-local gate: one in-flight dry-run per admin and 60s between starts.
 * Does not coordinate across Vercel instances (documented limitation).
 */
export function beginAdminFullDryRun(adminUserId: string, nowMs = Date.now()): DryRunGate {
  if (inFlightAdmins.has(adminUserId)) {
    return { ok: false, code: 'in_progress' }
  }

  const last = lastStartedByAdmin.get(adminUserId)
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

  inFlightAdmins.add(adminUserId)
  lastStartedByAdmin.set(adminUserId, nowMs)
  return { ok: true }
}

export function endAdminFullDryRun(adminUserId: string): void {
  inFlightAdmins.delete(adminUserId)
}
