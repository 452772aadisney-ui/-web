export type HamburgerMenuItem = {
  href: string
  label: string
  badgeCount?: number
}

export const STUDENT_HAMBURGER_ITEMS = [
  { href: '/dashboard', label: 'マイページ' },
  { href: '/dashboard/study', label: '学習記録' },
  { href: '/dashboard/bookshelf', label: '本棚' },
  { href: '/dashboard/calendar', label: 'カレンダー' },
  { href: '/dashboard/todo', label: 'ToDoリスト' },
  { href: '/dashboard/coaching', label: 'コーチング' },
  { href: '/dashboard/announcements', label: 'お知らせ' },
  { href: '/dashboard/chat', label: 'メッセージ' },
  { href: '/dashboard/info', label: '生徒情報' },
] as const

export const ADMIN_HAMBURGER_ITEMS = [
  { href: '/admin', label: '管理画面' },
  { href: '/admin/profile', label: 'プロフィールを編集' },
] as const
