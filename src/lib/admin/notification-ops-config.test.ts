import { describe, expect, it } from 'vitest'
import {
  classifySafeDeliveryError,
  envPresence,
  NOTIFICATION_OPS_CRONS,
  pushSendingFlagLabel,
  sanitizeErrorCodeForDisplay,
} from '@/lib/admin/notification-ops-config'
import {
  ADMIN_CATEGORY_TEST_FIXTURES,
  ADMIN_CATEGORY_TEST_KINDS,
  buildAdminTestIdempotencyKey,
  resolveAdminCategoryTestKind,
} from '@/lib/admin/notification-test-config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('notification-ops-config', () => {
  it('exposes presence only for secrets', () => {
    expect(envPresence(undefined)).toBe('missing')
    expect(envPresence('')).toBe('missing')
    expect(envPresence('  ')).toBe('missing')
    expect(envPresence('secret-value')).toBe('configured')
    expect(JSON.stringify(envPresence('secret-value'))).not.toContain('secret')
  })

  it('labels push sending without exposing other env', () => {
    expect(pushSendingFlagLabel({ PUSH_SENDING_ENABLED: 'true' })).toBe('ON')
    expect(pushSendingFlagLabel({ PUSH_SENDING_ENABLED: 'false' })).toBe('OFF')
  })

  it('classifies safe error buckets', () => {
    expect(
      classifySafeDeliveryError({ status: 'failed', errorCode: 'gone', httpStatus: 410 }),
    ).toBe('gone_404_410')
    expect(
      classifySafeDeliveryError({ status: 'failed', errorCode: 'transient', httpStatus: 429 }),
    ).toBe('rate_limited_429')
    expect(
      classifySafeDeliveryError({ status: 'failed', errorCode: 'network', httpStatus: null }),
    ).toBe('network')
    expect(
      classifySafeDeliveryError({
        status: 'failed',
        errorCode: 'provider_error',
        httpStatus: 503,
      }),
    ).toBe('provider_error')
  })

  it('sanitizes unknown error codes', () => {
    expect(sanitizeErrorCodeForDisplay('gone')).toBe('gone')
    expect(sanitizeErrorCodeForDisplay('SELECT * FROM secrets')).toBe('classified_error')
  })

  it('matches vercel.json cron paths and schedules', () => {
    const vercelJson = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> }
    for (const cron of NOTIFICATION_OPS_CRONS) {
      expect(vercelJson.crons).toEqual(
        expect.arrayContaining([{ path: cron.path, schedule: cron.scheduleUtc }]),
      )
    }
  })
})

describe('admin category test fixtures', () => {
  it('defines five fixed kinds with dashboard paths only', () => {
    expect(ADMIN_CATEGORY_TEST_KINDS).toHaveLength(5)
    for (const kind of ADMIN_CATEGORY_TEST_KINDS) {
      const fixture = ADMIN_CATEGORY_TEST_FIXTURES[kind]
      expect(fixture.targetPath.startsWith('/dashboard')).toBe(true)
      expect(fixture.pushBody.length).toBeGreaterThan(0)
      expect(fixture.emailSubject.includes('テスト')).toBe(true)
    }
  })

  it('rejects arbitrary category / external paths are not user-supplied', () => {
    expect(resolveAdminCategoryTestKind('study_reminder')).toBe('study_reminder')
    expect(resolveAdminCategoryTestKind('evil')).toBeNull()
    expect(resolveAdminCategoryTestKind({ path: 'https://evil.example' })).toBeNull()
  })

  it('scopes rate-limit keys by category without embedding secrets', () => {
    const key = buildAdminTestIdempotencyKey({
      kind: 'push',
      adminUserId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      targetUserId: '11111111-1111-1111-1111-111111111111',
      category: 'announcement',
      nowMs: 0,
    })
    expect(key.startsWith('admin-test:announcement:push:')).toBe(true)
  })
})
