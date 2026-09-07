import { describe, expect, it } from 'vitest'
import { detectPushClientPlatform } from '@/lib/push/platform'

describe('detectPushClientPlatform', () => {
  it('detects iPhone and iPad', () => {
    expect(detectPushClientPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'ios',
    )
    expect(
      detectPushClientPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', {
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('ios')
  })

  it('detects Android', () => {
    expect(
      detectPushClientPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('android')
  })

  it('detects desktop Chrome/Edge-like UAs', () => {
    expect(
      detectPushClientPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('desktop')
    expect(
      detectPushClientPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        { platform: 'MacIntel', maxTouchPoints: 0 },
      ),
    ).toBe('desktop')
  })
})
