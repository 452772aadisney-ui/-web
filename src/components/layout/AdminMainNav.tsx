'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/students', label: '生徒一覧' },
  { href: '/admin/schedule', label: 'スケジュール' },
  { href: '/admin/textbooks', label: '参考書登録' },
  { href: '/admin/chat', label: 'メッセージ', showBadge: true },
  { href: '/admin/announcements', label: 'お知らせ' },
  { href: '/admin/tags', label: 'タグ管理' },
] as const

interface AdminMainNavProps {
  unreadChatCount: number
}

export function AdminMainNav({ unreadChatCount }: AdminMainNavProps) {
  const pathname = usePathname()

  return (
    <nav className="border-b border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === '/admin/students' &&
              (pathname?.startsWith('/admin/students') ?? false)) ||
            (item.href === '/admin/schedule' &&
              (pathname?.startsWith('/admin/schedule') ?? false)) ||
            (item.href === '/admin/textbooks' &&
              (pathname?.startsWith('/admin/textbooks') ?? false)) ||
            (item.href === '/admin/chat' &&
              (pathname?.startsWith('/admin/chat') ?? false))

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
              {'showBadge' in item && item.showBadge && unreadChatCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
