export const FLASH_TOAST_COOKIE = 'app_flash_toast'

export type FlashToastKind = 'login' | 'logout' | 'auth_required'

export const FLASH_TOAST_MESSAGES: Record<FlashToastKind, string> = {
  login: 'ログインしました',
  logout: 'ログアウトしました',
  auth_required: 'ログインが必要です',
}

export function isFlashToastKind(value: string | undefined | null): value is FlashToastKind {
  return value === 'login' || value === 'logout' || value === 'auth_required'
}

export function getFlashToastMessage(kind: FlashToastKind): string {
  return FLASH_TOAST_MESSAGES[kind]
}

/** Cookie options shared by middleware redirects (and mirrored in flash-toast-server). */
export const FLASH_TOAST_COOKIE_OPTIONS = {
  httpOnly: false,
  maxAge: 60,
  path: '/',
  sameSite: 'lax' as const,
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

/** Client: clear the flash cookie after consuming. */
export function clearFlashToastCookieClient(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${FLASH_TOAST_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}

/** Client: read once and clear. */
export function consumeFlashToastCookieClient(): FlashToastKind | null {
  const kind = readFlashToastCookieClient()
  if (kind) clearFlashToastCookieClient()
  return kind
}
