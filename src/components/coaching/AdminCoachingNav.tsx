'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/coaching', label: '枠設定' },
  { href: '/admin/coaching/bookings', label: '予約確認' },
] as const

export function AdminCoachingNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/admin/coaching'
            ? pathname === '/admin/coaching'
            : pathname?.startsWith(item.href) ?? false

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-primary text-white'
                : 'border border-border hover:bg-background',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
