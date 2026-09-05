import { describe, expect, it } from 'vitest'
import {
  TEST_NOTIFICATION_COOLDOWN_MS,
  isPushSendingAvailable,
  resolvePushSendConfig,
} from '@/lib/push/send-config'

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PUSH_SENDING_ENABLED: 'true',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BKpublicKeyValueThatIsLongEnough1234567890',
    VAPID_PRIVATE_KEY: 'privateKeyValueThatIsLongEnough1234567890',
    VAPID_SUBJECT: 'mailto:ops@example.com',
    ...overrides,
  }
}

describe('resolvePushSendConfig', () => {
  it('enables only when flag is exactly true and keys are valid', () => {
    expect(resolvePushSendConfig(baseEnv()).ok).toBe(true)
  })

  it('rejects non-exact flag values', () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) {
      const result = resolvePushSendConfig(baseEnv({ PUSH_SENDING_ENABLED: value }))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('disabled')
    }
  })

  it('disables on Vercel Preview even when flag is true', () => {
    const result = resolvePushSendConfig(baseEnv({ VERCEL_ENV: 'preview' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('disabled')
  })

  it('rejects missing or invalid subject/keys without leaking secrets', () => {
    const incomplete = resolvePushSendConfig(baseEnv({ VAPID_PRIVATE_KEY: '' }))
    expect(incomplete).toEqual({ ok: false, reason: 'incomplete' })

    const invalidSubject = resolvePushSendConfig(
      baseEnv({ VAPID_SUBJECT: 'http://insecure.example' }),
    )
    expect(invalidSubject).toEqual({ ok: false, reason: 'invalid' })

    expect(JSON.stringify(incomplete)).not.toContain('privateKey')
    expect(JSON.stringify(invalidSubject)).not.toContain('mailto')
  })

  it('exposes a public availability helper', () => {
    expect(isPushSendingAvailable(baseEnv())).toBe(true)
    expect(isPushSendingAvailable(baseEnv({ PUSH_SENDING_ENABLED: 'false' }))).toBe(false)
  })

  it('keeps cooldown constant centralized', () => {
    expect(TEST_NOTIFICATION_COOLDOWN_MS).toBe(30_000)
  })
})
