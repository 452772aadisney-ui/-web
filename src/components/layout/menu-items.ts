export type HamburgerMenuItem = {
  href: string
  label: string
  badgeCount?: number
}

export const STUDENT_HAMBURGER_ITEMS = [
  { href: '/dashboard', label: 'マイページ' },
  { href: '/dashboard/study', label: '学習を記録する' },
  { href: '/dashboard/study/history', label: '学習履歴' },
  { href: '/dashboard/achievements', label: '実績一覧' },
  { href: '/dashboard/bookshelf', label: '本棚' },
  { href: '/dashboard/textbooks/register', label: '教材登録' },
  { href: '/dashboard/calendar', label: 'カレンダー' },
  { href: '/dashboard/todo', label: 'ToDoリスト' },
  { href: '/dashboard/coaching', label: 'コーチング' },
  { href: '/dashboard/quizzes', label: '小テスト' },
  { href: '/dashboard/announcements', label: 'お知らせ' },
  { href: '/dashboard/chat', label: 'メッセージ' },
  { href: '/dashboard/faq', label: 'よくある質問' },
  { href: '/dashboard/info', label: '生徒情報' },
] as const

export const ADMIN_HAMBURGER_ITEMS = [
  { href: '/admin', label: 'マイページ' },
  { href: '/admin/faq', label: 'FAQ管理' },
  { href: '/admin/tags', label: 'タグ管理' },
  { href: '/admin/profile', label: 'プロフィールを編集' },
] as const
