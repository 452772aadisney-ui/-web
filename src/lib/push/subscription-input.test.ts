import { describe, expect, it } from 'vitest'
import {
  isValidPushEndpoint,
  parsePushSubscriptionInput,
} from '@/lib/push/subscription-input'

const validSub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: {
    p256dh: 'BK3exampleKeyValueThatIsLongEnoughToPassMinLenXX',
    auth: 'authKeyValue12',
  },
}

describe('isValidPushEndpoint', () => {
  it('accepts https push endpoints', () => {
    expect(isValidPushEndpoint(validSub.endpoint)).toBe(true)
  })

  it('rejects unsafe endpoints', () => {
    expect(isValidPushEndpoint('http://example.com/push')).toBe(false)
    expect(isValidPushEndpoint('https://localhost/push')).toBe(false)
    expect(isValidPushEndpoint('https://user:pass@example.com/push')).toBe(false)
    expect(isValidPushEndpoint('https://example.com/push#frag')).toBe(false)
    expect(isValidPushEndpoint('')).toBe(false)
  })
})

describe('parsePushSubscriptionInput', () => {
  it('parses a valid subscription and ignores extra fields', () => {
    const parsed = parsePushSubscriptionInput({
      ...validSub,
      extra: 'ignore-me',
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.endpoint).toBe(validSub.endpoint)
      expect(parsed.value.keys.p256dh).toBe(validSub.keys.p256dh)
      expect(parsed.value.keys.auth).toBe(validSub.keys.auth)
    }
  })

  it('rejects invalid keys and endpoints without echoing them', () => {
    const badKey = parsePushSubscriptionInput({
      ...validSub,
      keys: { p256dh: '+++', auth: validSub.keys.auth },
    })
    expect(badKey).toEqual({ ok: false, code: 'invalid_subscription' })

    const badEndpoint = parsePushSubscriptionInput({
      ...validSub,
      endpoint: 'https://127.0.0.1/push',
    })
    expect(badEndpoint).toEqual({ ok: false, code: 'invalid_subscription' })
  })
})
