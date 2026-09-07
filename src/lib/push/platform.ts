export type PushClientPlatform = 'ios' | 'android' | 'desktop' | 'unknown'

/**
 * Best-effort client platform for setup copy only.
 * iOS detection matches likelyRequiresStandaloneForPush UA heuristics.
 */
export function detectPushClientPlatform(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  options?: { maxTouchPoints?: number; platform?: string },
): PushClientPlatform {
  const maxTouchPoints =
    options?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0)
  const platform =
    options?.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '')

  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  if (isIOS) return 'ios'

  if (/Android/i.test(userAgent)) return 'android'

  // Desktop browsers (exclude mobile UA leftovers after Android/iOS checks).
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
    return 'desktop'
  }

  return 'unknown'
}
