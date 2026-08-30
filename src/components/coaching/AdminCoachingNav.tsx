'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/coaching/slots', label: '枠設定' },
  { href: '/admin/coaching/instructors', label: '講師追加' },
  { href: '/admin/coaching/bookings', label: '予約確認' },
  { href: '/admin/coaching/karte', label: 'カルテ' },
] as const

export function AdminCoachingNav() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2">
      <Link
        href="/admin/coaching"
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-background"
      >
        メニュー
      </Link>
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href === '/admin/coaching/karte' && pathname?.startsWith('/admin/coaching/karte'))

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
