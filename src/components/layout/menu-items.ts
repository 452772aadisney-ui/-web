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
  { href: '/dashboard/bookshelf', label: 'My本棚' },
  { href: '/dashboard/textbooks/search', label: '教材登録' },
  { href: '/dashboard/calendar', label: 'カレンダー' },
  { href: '/dashboard/todo', label: 'ToDoリスト' },
  { href: '/dashboard/coaching', label: 'コーチング' },
  { href: '/dashboard/quizzes', label: '小テスト' },
  { href: '/dashboard/announcements', label: 'お知らせ' },
  { href: '/dashboard/chat', label: 'メッセージ' },
  { href: '/dashboard/faq', label: 'よくある質問' },
  { href: '/dashboard/notifications', label: '通知設定' },
  { href: '/dashboard/info', label: '生徒情報' },
] as const

export const ADMIN_HAMBURGER_ITEMS = [
  { href: '/admin', label: 'マイページ' },
  { href: '/admin/students', label: '生徒一覧' },
  { href: '/admin/study-daily', label: '毎日管理' },
  { href: '/admin/schedule', label: 'スケジュール' },
  { href: '/admin/class-schedule', label: '既卒生 授業予定' },
  { href: '/admin/quizzes', label: '小テスト' },
  { href: '/admin/coaching', label: 'コーチング' },
  { href: '/admin/bookshelf', label: '本棚' },
  { href: '/admin/chat', label: 'メッセージ' },
  { href: '/admin/announcements', label: 'お知らせ' },
  { href: '/admin/achievements', label: '実績' },
  { href: '/admin/faq', label: 'FAQ管理' },
  { href: '/admin/tags', label: 'タグ管理' },
  { href: '/admin/notifications', label: '通知運用' },
  { href: '/admin/profile', label: 'プロフィール' },
] as const
