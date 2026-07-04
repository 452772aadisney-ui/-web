export type HamburgerMenuItem = {
  href: string
  label: string
  badgeCount?: number
}

export const STUDENT_HAMBURGER_ITEMS = [
  { href: '/dashboard', label: 'ダッシュボード' },
  { href: '/dashboard/chat', label: 'メッセージ' },
  { href: '/dashboard/profile', label: 'プロフィールを編集' },
] as const

export const ADMIN_HAMBURGER_ITEMS = [
  { href: '/admin', label: '管理画面' },
  { href: '/admin/profile', label: 'プロフィールを編集' },
] as const
