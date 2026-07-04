import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import {
  ADMIN_HAMBURGER_ITEMS,
  type HamburgerMenuItem,
} from '@/components/layout/menu-items'
import { HamburgerMenu } from '@/components/layout/HamburgerMenu'
import { AdminMainNav } from '@/components/layout/AdminMainNav'

interface AdminPageShellProps {
  title: string
  backHref?: string
  backLabel?: string
  showMainNav?: boolean
  children: ReactNode
}

export async function AdminPageShell({
  title,
  backHref,
  backLabel,
  showMainNav = true,
  children,
}: AdminPageShellProps) {
  const profile = await getCurrentProfile()
  const unreadChatCount = profile ? await fetchUnreadChatCount(profile.id) : 0

  const menuItems: HamburgerMenuItem[] = ADMIN_HAMBURGER_ITEMS.map((item) => ({ ...item }))

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            {backHref && (
              <Link href={backHref} className="text-sm text-primary hover:underline">
                ← {backLabel ?? '戻る'}
              </Link>
            )}
            <p className="text-sm text-muted">受験生web</p>
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          <HamburgerMenu items={menuItems} />
        </div>
      </header>

      {showMainNav && <AdminMainNav unreadChatCount={unreadChatCount} />}

      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
