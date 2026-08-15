'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/students', label: '生徒一覧' },
  {
    href: '/admin/study-daily',
    label: '毎日管理',
    badgeKey: 'studyDaily' as const,
  },
  { href: '/admin/schedule', label: 'スケジュール' },
  { href: '/admin/coaching', label: 'コーチング' },
  { href: '/admin/bookshelf', label: '本棚' },
  { href: '/admin/chat', label: 'メッセージ', badgeKey: 'chat' as const },
  { href: '/admin/announcements', label: 'お知らせ' },
] as const

interface AdminMainNavProps {
  unreadChatCount: number
  incompleteStudyFeedbackCount: number
}

export function AdminMainNav({
  unreadChatCount,
  incompleteStudyFeedbackCount,
}: AdminMainNavProps) {
  const pathname = usePathname()

  function getBadgeCount(badgeKey: 'chat' | 'studyDaily'): number {
    if (badgeKey === 'chat') return unreadChatCount
    return incompleteStudyFeedbackCount
  }

  return (
    <nav className="border-b border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === '/admin/students' &&
              (pathname?.startsWith('/admin/students') ?? false)) ||
            (item.href === '/admin/study-daily' &&
              (pathname?.startsWith('/admin/study-daily') ?? false)) ||
            (item.href === '/admin/schedule' &&
              (pathname?.startsWith('/admin/schedule') ?? false)) ||
            (item.href === '/admin/coaching' &&
              (pathname?.startsWith('/admin/coaching') ?? false)) ||
            (item.href === '/admin/bookshelf' &&
              (pathname?.startsWith('/admin/bookshelf') ?? false)) ||
            (item.href === '/admin/chat' && (pathname?.startsWith('/admin/chat') ?? false))

          const badgeCount = 'badgeKey' in item ? getBadgeCount(item.badgeKey) : 0

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative inline-block rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-primary text-white'
                  : 'border border-border hover:bg-background',
              )}
            >
              {item.label}
              {'badgeKey' in item && badgeCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
