import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginAdminFullDryRun,
  endAdminFullDryRun,
  resetAdminFullDryRunRateLimitForTests,
} from '@/lib/admin/notification-test-dry-run-gate'
import { runAdminFullStudyReminderDryRun } from '@/lib/admin/notification-test-full-dry-run'
import { ADMIN_FULL_DRY_RUN_COOLDOWN_MS } from '@/lib/admin/notification-test-config'

const { evaluateAdminFullDryRunReport } = vi.hoisted(() => ({
  evaluateAdminFullDryRunReport: vi.fn(),
}))

vi.mock('@/lib/study/study-reminder-dry-run', async () => {
  const actual = await vi.importActual<typeof import('@/lib/study/study-reminder-dry-run')>(
    '@/lib/study/study-reminder-dry-run',
  )
  return {
    ...actual,
    evaluateAdminFullDryRunReport: (...args: unknown[]) =>
      evaluateAdminFullDryRunReport(...args),
  }
})

describe('admin full dry-run gate', () => {
  beforeEach(() => {
    resetAdminFullDryRunRateLimitForTests()
  })

  it('blocks overlapping runs and enforces cooldown', () => {
    expect(beginAdminFullDryRun('admin-1', 1_000).ok).toBe(true)
    expect(beginAdminFullDryRun('admin-1', 1_100)).toEqual({ ok: false, code: 'in_progress' })
    endAdminFullDryRun('admin-1')

    const limited = beginAdminFullDryRun('admin-1', 1_000 + ADMIN_FULL_DRY_RUN_COOLDOWN_MS - 1)
    expect(limited.ok).toBe(false)
    if (limited.ok) return
    expect(limited.code).toBe('rate_limited')

    expect(beginAdminFullDryRun('admin-1', 1_000 + ADMIN_FULL_DRY_RUN_COOLDOWN_MS).ok).toBe(true)
    endAdminFullDryRun('admin-1')
  })
})

describe('runAdminFullStudyReminderDryRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAdminFullDryRunRateLimitForTests()
  })

  it('requires feature flag', async () => {
    const result = await runAdminFullStudyReminderDryRun({
      adminUserId: 'admin-1',
      env: { ADMIN_NOTIFICATION_TEST_ENABLED: 'false' },
    })
    expect(result).toEqual({ ok: false, code: 'feature_disabled' })
    expect(evaluateAdminFullDryRunReport).not.toHaveBeenCalled()
  })

  it('returns dual report without requiring allowlist', async () => {
    evaluateAdminFullDryRunReport.mockResolvedValue({
      ok: true,
      report: {
        dateKey: '2026-09-05',
        evaluatedAt: '2026-09-05T13:00:00.000Z',
        durationMs: 12,
        readiness: {
          totalStudents: 1,
          alreadyRecorded: 1,
          preferenceDisabled: 0,
          readyForPush: 0,
          emailOnly: 0,
          cannotDeliver: 0,
          failedToEvaluate: 0,
          missingStudyLog: 0,
          preferenceEnabled: 1,
          withActivePushSubscription: 0,
          withoutActivePushSubscription: 1,
          withEmail: 1,
          withoutEmail: 0,
        },
        current: {
          deliveryMode: 'legacy',
          pushSendingEnabled: false,
          legacyEmailPreferred: true,
          totalStudents: 1,
          alreadyRecorded: 1,
          preferenceDisabled: 0,
          wouldUsePush: 0,
          wouldUseEmail: 0,
          cannotDeliver: 0,
          failedToEvaluate: 0,
        },
      },
    })

    const result = await runAdminFullStudyReminderDryRun({
      adminUserId: 'admin-1',
      env: {
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sumConsistent).toEqual({ readiness: true, current: true })
    expect(JSON.stringify(result.report)).not.toContain('admin-1')
  })
})
