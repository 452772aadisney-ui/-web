/**
 * Allowed request Origin checks for cookie-authenticated Push APIs.
 * Read-only; does not log secrets.
 */

function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.username || url.password || url.search || url.hash) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function collectAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    const origin = normalizeOrigin(appUrl)
    if (origin) allowed.add(origin)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (siteUrl) {
    const origin = normalizeOrigin(siteUrl)
    if (origin) allowed.add(origin)
  }

  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0]?.trim()
    if (host) {
      const proto = forwardedProto.split(',')[0]?.trim() || 'https'
      const origin = normalizeOrigin(`${proto}://${host}`)
      if (origin) allowed.add(origin)
    }
  }

  // Local development
  allowed.add('http://localhost:3000')
  allowed.add('http://127.0.0.1:3000')
  allowed.add('http://localhost:3456')
  allowed.add('http://127.0.0.1:3456')

  return allowed
}

export type OriginCheckResult = { ok: true } | { ok: false; reason: 'missing' | 'mismatch' }

/**
 * Mutating Push endpoints require a matching Origin (CSRF mitigation).
 * Preview/production: Origin must match APP_URL or the request host.
 */
export function verifyRequestOrigin(request: Request): OriginCheckResult {
  const originHeader = request.headers.get('origin')
  if (!originHeader) {
    return { ok: false, reason: 'missing' }
  }

  const origin = normalizeOrigin(originHeader)
  if (!origin) {
    return { ok: false, reason: 'mismatch' }
  }

  const allowed = collectAllowedOrigins(request)
  if (!allowed.has(origin)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true }
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type')
  if (!contentType) return false
  return contentType.toLowerCase().includes('application/json')
}
