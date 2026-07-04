'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard/study', label: '学習記録' },
  { href: '/dashboard/bookshelf', label: '本棚' },
  { href: '/dashboard/calendar', label: 'カレンダー' },
  { href: '/dashboard/todo', label: 'ToDoリスト' },
  { href: '/dashboard/announcements', label: 'お知らせ', badge: 'announcement' as const },
  { href: '/dashboard/chat', label: 'メッセージ', badge: 'chat' as const },
] as const

interface StudentMainNavProps {
  unreadAnnouncementCount: number
  unreadChatCount: number
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function StudentMainNav({
  unreadAnnouncementCount,
  unreadChatCount,
}: StudentMainNavProps) {
  const pathname = usePathname()

  return (
    <nav className="border-b border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === '/dashboard/announcements' &&
              (pathname?.startsWith('/dashboard/announcements') ?? false)) ||
            (item.href === '/dashboard/chat' &&
              (pathname?.startsWith('/dashboard/chat') ?? false))

          const badgeCount =
            'badge' in item
              ? item.badge === 'announcement'
                ? unreadAnnouncementCount
                : item.badge === 'chat'
                  ? unreadChatCount
                  : 0
              : 0

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
              {'badge' in item && <Badge count={badgeCount} />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
