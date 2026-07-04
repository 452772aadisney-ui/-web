import type { UserRole } from '@/types/database'

/** ロールに応じたログイン後の遷移先 */
export function getDashboardPathForRole(role: UserRole): string {
  return role === 'admin' ? '/admin' : '/dashboard'
}

export const AUTH_PATHS = ['/login', '/signup', '/forgot-password'] as const

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname.startsWith(path))
}
