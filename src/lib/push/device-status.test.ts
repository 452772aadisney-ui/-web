import { describe, expect, it } from 'vitest'
import {
  deriveDeviceNotificationStatus,
  deviceStatusHeadline,
} from '@/lib/push/device-status'

const base = {
  supported: true,
  requiresStandalone: false,
  configured: true,
  permission: 'default' as const,
  hasBrowserSubscription: false,
  serverSubscribed: false,
  serverStatusFailed: false,
}

describe('deriveDeviceNotificationStatus', () => {
  it('detects unsupported and standalone requirements', () => {
    expect(
      deriveDeviceNotificationStatus({ ...base, supported: false, requiresStandalone: true }),
    ).toBe('requires_standalone')
    expect(deriveDeviceNotificationStatus({ ...base, supported: false })).toBe('unsupported')
  })

  it('requires browser subscription plus server for subscribed', () => {
    expect(
      deriveDeviceNotificationStatus({
        ...base,
        permission: 'granted',
        hasBrowserSubscription: false,
        serverSubscribed: true,
      }),
    ).toBe('ready_to_enable')

    expect(
      deriveDeviceNotificationStatus({
        ...base,
        permission: 'granted',
        hasBrowserSubscription: true,
        serverSubscribed: true,
      }),
    ).toBe('subscribed')

    expect(
      deriveDeviceNotificationStatus({
        ...base,
        permission: 'granted',
        hasBrowserSubscription: true,
        serverSubscribed: false,
      }),
    ).toBe('needs_sync')
  })

  it('handles denied and missing config', () => {
    expect(
      deriveDeviceNotificationStatus({ ...base, permission: 'denied' }),
    ).toBe('permission_denied')
    expect(deriveDeviceNotificationStatus({ ...base, configured: false })).toBe('not_configured')
  })
})

describe('deviceStatusHeadline', () => {
  it('uses student-facing copy without internal terms', () => {
    const text = deviceStatusHeadline('subscribed')
    expect(text).toContain('この端末')
    expect(text.toLowerCase()).not.toContain('vapid')
    expect(text.toLowerCase()).not.toContain('service worker')
  })
})
