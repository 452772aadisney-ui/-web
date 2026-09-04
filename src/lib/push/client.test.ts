import { describe, expect, it } from 'vitest'
import { isPushSendingEnabled } from '@/lib/push/env'
import { urlBase64ToUint8Array } from '@/lib/push/client'
import { getLocalPushState } from '@/lib/push/client'

describe('isPushSendingEnabled', () => {
  it('is true only for exact string true', () => {
    const original = process.env.PUSH_SENDING_ENABLED
    process.env.PUSH_SENDING_ENABLED = 'true'
    expect(isPushSendingEnabled()).toBe(true)
    process.env.PUSH_SENDING_ENABLED = 'TRUE'
    expect(isPushSendingEnabled()).toBe(false)
    process.env.PUSH_SENDING_ENABLED = 'false'
    expect(isPushSendingEnabled()).toBe(false)
    delete process.env.PUSH_SENDING_ENABLED
    expect(isPushSendingEnabled()).toBe(false)
    process.env.PUSH_SENDING_ENABLED = original
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without secrets in failures', () => {
    // "hello" in base64url
    const bytes = urlBase64ToUint8Array('aGVsbG8')
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111])
  })
})

describe('getLocalPushState (SSR-safe)', () => {
  it('does not throw without window', () => {
    expect(() => getLocalPushState()).not.toThrow()
    const state = getLocalPushState()
    expect(state.supported).toBe(false)
    expect(state.permission).toBe('unsupported')
  })
})
