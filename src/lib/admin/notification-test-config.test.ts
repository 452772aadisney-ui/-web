import { describe, expect, it } from 'vitest'
import {
  buildAdminTestIdempotencyKey,
  isAdminNotificationTestEnabled,
  parseNotificationTestUserIds,
  resolveAdminNotificationTestAvailability,
  ADMIN_NOTIFICATION_TEST_COOLDOWN_MS,
} from '@/lib/admin/notification-test-config'

describe('admin notification test config', () => {
  it('enables only on exact true', () => {
    expect(isAdminNotificationTestEnabled({ ADMIN_NOTIFICATION_TEST_ENABLED: 'true' })).toBe(true)
    expect(isAdminNotificationTestEnabled({ ADMIN_NOTIFICATION_TEST_ENABLED: 'TRUE' })).toBe(false)
    expect(isAdminNotificationTestEnabled({ ADMIN_NOTIFICATION_TEST_ENABLED: 'false' })).toBe(false)
    expect(isAdminNotificationTestEnabled({})).toBe(false)
  })

  it('rejects empty or invalid allowlists without echoing values', () => {
    expect(parseNotificationTestUserIds(undefined)).toEqual({ ok: false, reason: 'empty' })
    expect(parseNotificationTestUserIds('')).toEqual({ ok: false, reason: 'empty' })
    const invalid = parseNotificationTestUserIds('not-uuid')
    expect(invalid).toEqual({ ok: false, reason: 'invalid' })
    expect(JSON.stringify(invalid)).not.toContain('not-uuid')
  })

  it('dedupes valid UUIDs and requires flag+allowlist for availability', () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const parsed = parseNotificationTestUserIds(`${id},${id.toUpperCase()}`)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.ids.size).toBe(1)

    expect(
      resolveAdminNotificationTestAvailability({
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: id,
      }).available,
    ).toBe(true)

    expect(
      resolveAdminNotificationTestAvailability({
        ADMIN_NOTIFICATION_TEST_ENABLED: 'true',
        NOTIFICATION_TEST_USER_IDS: '',
      }),
    ).toMatchObject({ available: false, reason: 'allowlist_empty' })
  })

  it('builds cooldown buckets without colliding push/email', () => {
    const now = ADMIN_NOTIFICATION_TEST_COOLDOWN_MS * 10
    const pushKey = buildAdminTestIdempotencyKey({
      kind: 'push',
      adminUserId: 'admin',
      targetUserId: 'target',
      nowMs: now,
    })
    const emailKey = buildAdminTestIdempotencyKey({
      kind: 'email',
      adminUserId: 'admin',
      targetUserId: 'target',
      nowMs: now,
    })
    expect(pushKey).not.toEqual(emailKey)
    expect(pushKey).toContain('push')
    expect(emailKey).toContain('email')
  })
})
