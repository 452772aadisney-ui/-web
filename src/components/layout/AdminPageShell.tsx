import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { getJstDateKey } from '@/lib/study/dates'
import { fetchIncompleteStudyFeedbackCount } from '@/lib/study/feedback-queries'
import {
  ADMIN_HAMBURGER_ITEMS,
  type HamburgerMenuItem,
} from '@/components/layout/menu-items'
import { BackButton } from '@/components/layout/BackButton'
import { HamburgerMenu } from '@/components/layout/HamburgerMenu'
import { AdminMainNav } from '@/components/layout/AdminMainNav'

interface AdminPageShellProps {
  title: string
  backHref?: string
  backLabel?: string
  showMainNav?: boolean
  wide?: boolean
  extraWide?: boolean
  children: ReactNode
}

export async function AdminPageShell({
  title,
  backHref,
  backLabel,
  showMainNav = true,
  wide = false,
  extraWide = false,
  children,
}: AdminPageShellProps) {
  const profile = await getCurrentProfile()
  const unreadChatCount = profile ? await fetchUnreadChatCount(profile.id) : 0
  const incompleteStudyFeedbackCount = profile
    ? await fetchIncompleteStudyFeedbackCount(getJstDateKey())
    : 0

  const menuItems: HamburgerMenuItem[] = ADMIN_HAMBURGER_ITEMS.map((item) => ({ ...item }))
  const containerClass = extraWide
    ? 'max-w-[1440px]'
    : wide
      ? 'max-w-6xl'
      : 'max-w-3xl'

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className={`mx-auto flex ${containerClass} items-center justify-between gap-4`}>
          <div className="min-w-0">
            <Link href="/admin" className="text-sm text-muted transition hover:text-foreground">
              受験生web
            </Link>
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          <HamburgerMenu items={menuItems} />
        </div>
      </header>

      {showMainNav && (
        <div className="sticky top-[4.75rem] z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <AdminMainNav
            unreadChatCount={unreadChatCount}
            incompleteStudyFeedbackCount={incompleteStudyFeedbackCount}
            containerClass={containerClass}
          />
        </div>
      )}

      <main className={`mx-auto ${containerClass} px-4 py-8`}>
        {backHref && (
          <div className="mb-6">
            <BackButton href={backHref} label={backLabel} />
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
