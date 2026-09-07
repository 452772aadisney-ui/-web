export const FLASH_TOAST_COOKIE = 'app_flash_toast'

export type FlashToastKind =
  | 'login'
  | 'logout'
  | 'auth_required'
  | 'class_schedule_created'
  | 'class_schedule_created_notify_partial'
  | 'class_schedule_created_notify_failed'
  | 'class_schedule_day_deleted'

export const FLASH_TOAST_MESSAGES: Record<FlashToastKind, string> = {
  login: 'ログインしました',
  logout: 'ログアウトしました',
  auth_required: 'ログインが必要です',
  class_schedule_created: '授業予定を登録しました',
  class_schedule_created_notify_partial:
    '予定は保存しましたが、一部の通知に失敗しました',
  class_schedule_created_notify_failed:
    '予定は保存しましたが、通知を送信できませんでした',
  class_schedule_day_deleted: '誤登録を削除しました',
}

const FLASH_TOAST_KIND_SET = new Set<string>(Object.keys(FLASH_TOAST_MESSAGES))

export function isFlashToastKind(value: string | undefined | null): value is FlashToastKind {
  return value != null && FLASH_TOAST_KIND_SET.has(value)
}

export function getFlashToastMessage(kind: FlashToastKind): string {
  return FLASH_TOAST_MESSAGES[kind]
}

/** Secure in production HTTPS; omit on localhost HTTP so the cookie still sticks. */
export const FLASH_TOAST_COOKIE_SECURE = process.env.NODE_ENV === 'production'

/** Cookie options shared by middleware redirects (and mirrored in flash-toast-server). */
export const FLASH_TOAST_COOKIE_OPTIONS = {
  httpOnly: false,
  maxAge: 60,
  path: '/',
  sameSite: 'lax' as const,
  secure: FLASH_TOAST_COOKIE_SECURE,
}

/** Client: read flash kind from document.cookie (does not clear). */
export function readFlashToastCookieClient(): FlashToastKind | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${FLASH_TOAST_COOKIE}=`))
  if (!match) return null
  const value = decodeURIComponent(match.slice(FLASH_TOAST_COOKIE.length + 1))
  return isFlashToastKind(value) ? value : null
}

/** Client: clear the flash cookie after consuming (flags must match set options). */
export function clearFlashToastCookieClient(): void {
  if (typeof document === 'undefined') return
  const secure = FLASH_TOAST_COOKIE_SECURE ? '; Secure' : ''
  document.cookie = `${FLASH_TOAST_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
}

/** Client: read once and clear. */
export function consumeFlashToastCookieClient(): FlashToastKind | null {
  const kind = readFlashToastCookieClient()
  if (kind) clearFlashToastCookieClient()
  return kind
}
