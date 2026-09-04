/** Safe Web Push payload shape (no PII / secrets). */
export interface WebPushPayload {
  title: string
  body: string
  targetPath: string
  tag?: string
  notificationType?: string
}

export const DEFAULT_PUSH_TITLE = '受験生web'
export const DEFAULT_PUSH_BODY = '新しいお知らせがあります'
export const DEFAULT_DASHBOARD_PATH = '/dashboard'

export const MAX_PUSH_TITLE_LENGTH = 64
export const MAX_PUSH_BODY_LENGTH = 120
export const MAX_PUSH_TAG_LENGTH = 64
export const MAX_PUSH_PATH_LENGTH = 512

/**
 * Allow only same-app student paths:
 * `/dashboard`, `/dashboard/...`, `/dashboard?...`
 */
export function sanitizeDashboardPath(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DASHBOARD_PATH

  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_PUSH_PATH_LENGTH) {
    return DEFAULT_DASHBOARD_PATH
  }

  // Reject control chars
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return DEFAULT_DASHBOARD_PATH
  }

  // Absolute / protocol-relative / dangerous schemes
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\')
  ) {
    return DEFAULT_DASHBOARD_PATH
  }

  // Must be app-relative dashboard path (blocks /dashboard-evil, /admin, /login)
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? ''
  const isExact = pathOnly === '/dashboard'
  const isNested = pathOnly.startsWith('/dashboard/')
  if (!isExact && !isNested) {
    // Allow `/dashboard?query` (pathOnly === '/dashboard' already covered;
    // if somehow query-only malformed, reject)
    if (!(trimmed.startsWith('/dashboard?') && pathOnly === '/dashboard')) {
      return DEFAULT_DASHBOARD_PATH
    }
  }

  // Disallow /admin even if somehow nested under a weird path
  if (pathOnly === '/admin' || pathOnly.startsWith('/admin/')) {
    return DEFAULT_DASHBOARD_PATH
  }

  return trimmed
}

export function truncateText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}

export function sanitizeNotificationTag(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.trim().replace(/[^\w.:@-]/g, '').slice(0, MAX_PUSH_TAG_LENGTH)
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Parse push event data safely. Invalid payloads fall back to a generic message.
 * Returns null when the payload should be ignored (empty / unusable).
 */
export function parseWebPushPayload(rawText: string | null | undefined): WebPushPayload | null {
  if (rawText == null) {
    return {
      title: DEFAULT_PUSH_TITLE,
      body: DEFAULT_PUSH_BODY,
      targetPath: DEFAULT_DASHBOARD_PATH,
    }
  }

  const text = rawText.trim()
  if (!text) {
    return {
      title: DEFAULT_PUSH_TITLE,
      body: DEFAULT_PUSH_BODY,
      targetPath: DEFAULT_DASHBOARD_PATH,
    }
  }

  if (text.length > 8_000) {
    return {
      title: DEFAULT_PUSH_TITLE,
      body: DEFAULT_PUSH_BODY,
      targetPath: DEFAULT_DASHBOARD_PATH,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return {
      title: DEFAULT_PUSH_TITLE,
      body: DEFAULT_PUSH_BODY,
      targetPath: DEFAULT_DASHBOARD_PATH,
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      title: DEFAULT_PUSH_TITLE,
      body: DEFAULT_PUSH_BODY,
      targetPath: DEFAULT_DASHBOARD_PATH,
    }
  }

  const record = parsed as Record<string, unknown>
  const titleRaw = typeof record.title === 'string' ? record.title : DEFAULT_PUSH_TITLE
  const bodyRaw = typeof record.body === 'string' ? record.body : DEFAULT_PUSH_BODY
  const title = truncateText(titleRaw || DEFAULT_PUSH_TITLE, MAX_PUSH_TITLE_LENGTH)
  const body = truncateText(bodyRaw || DEFAULT_PUSH_BODY, MAX_PUSH_BODY_LENGTH)
  const targetPath = sanitizeDashboardPath(record.targetPath)
  const tag = sanitizeNotificationTag(record.tag)
  const notificationType =
    typeof record.notificationType === 'string'
      ? record.notificationType.trim().slice(0, 64) || undefined
      : undefined

  return {
    title: title || DEFAULT_PUSH_TITLE,
    body: body || DEFAULT_PUSH_BODY,
    targetPath,
    ...(tag ? { tag } : {}),
    ...(notificationType ? { notificationType } : {}),
  }
}
