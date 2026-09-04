'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { signOut } from '@/app/auth/actions'
import type { HamburgerMenuItem } from '@/components/layout/menu-items'
import { cleanupPushSubscriptionBeforeLogout } from '@/lib/push/client'

export type { HamburgerMenuItem } from '@/components/layout/menu-items'

interface HamburgerMenuProps {
  items: HamburgerMenuItem[]
}

export function HamburgerMenu({ items }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSignOut = () => {
    startTransition(async () => {
      // Best-effort: disable this browser's push before ending the session.
      await cleanupPushSubscriptionBeforeLogout()
      await signOut()
    })
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-lg border border-border hover:bg-background"
        aria-label="メニューを開く"
        aria-expanded={open}
      >
        <span className="block h-0.5 w-4 rounded-full bg-foreground" />
        <span className="block h-0.5 w-4 rounded-full bg-foreground" />
        <span className="block h-0.5 w-4 rounded-full bg-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-border bg-card py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="relative block px-4 py-2.5 text-sm hover:bg-background"
            >
              {item.label}
              {(item.badgeCount ?? 0) > 0 && (
                <span className="absolute right-3 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {item.badgeCount! > 99 ? '99+' : item.badgeCount}
                </span>
              )}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isPending}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-background disabled:opacity-60"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  )
}
