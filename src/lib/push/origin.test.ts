import { describe, expect, it } from 'vitest'
import { isJsonContentType, verifyRequestOrigin } from '@/lib/push/origin'

function makeRequest(init: { origin?: string; contentType?: string; host?: string }) {
  const headers = new Headers()
  if (init.origin) headers.set('origin', init.origin)
  if (init.contentType) headers.set('content-type', init.contentType)
  if (init.host) headers.set('host', init.host)
  return new Request('https://app.example.com/api/push/subscription', {
    method: 'POST',
    headers,
  })
}

describe('verifyRequestOrigin', () => {
  it('rejects missing origin', () => {
    expect(verifyRequestOrigin(makeRequest({}))).toEqual({ ok: false, reason: 'missing' })
  })

  it('allows localhost and request host', () => {
    expect(
      verifyRequestOrigin(makeRequest({ origin: 'http://localhost:3000', host: 'localhost:3000' })),
    ).toEqual({ ok: true })

    expect(
      verifyRequestOrigin(
        makeRequest({ origin: 'https://app.example.com', host: 'app.example.com' }),
      ),
    ).toEqual({ ok: true })
  })

  it('rejects mismatched origin', () => {
    expect(
      verifyRequestOrigin(
        makeRequest({ origin: 'https://evil.example', host: 'app.example.com' }),
      ),
    ).toEqual({ ok: false, reason: 'mismatch' })
  })
})

describe('isJsonContentType', () => {
  it('requires application/json', () => {
    expect(isJsonContentType(makeRequest({ contentType: 'application/json' }))).toBe(true)
    expect(
      isJsonContentType(makeRequest({ contentType: 'application/json; charset=utf-8' })),
    ).toBe(true)
    expect(isJsonContentType(makeRequest({ contentType: 'text/plain' }))).toBe(false)
  })
})
