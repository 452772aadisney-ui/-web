import { describe, expect, it } from 'vitest'
import {
  isDesiredPushServiceWorkerScope,
  PUSH_SERVICE_WORKER_SCOPE,
} from '@/lib/push/register-service-worker'

describe('push service worker scope', () => {
  it('uses /dashboard/ as the desired scope', () => {
    expect(PUSH_SERVICE_WORKER_SCOPE).toBe('/dashboard/')
  })

  it('accepts only the dashboard scope path', () => {
    expect(isDesiredPushServiceWorkerScope('https://example.com/dashboard/')).toBe(true)
    expect(isDesiredPushServiceWorkerScope('https://example.com/')).toBe(false)
    expect(isDesiredPushServiceWorkerScope('https://example.com/dashboard')).toBe(false)
    expect(isDesiredPushServiceWorkerScope('https://example.com/admin/')).toBe(false)
  })
})
