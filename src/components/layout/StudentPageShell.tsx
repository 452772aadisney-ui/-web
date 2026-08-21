import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getPersonName } from '@/lib/auth/display-name'
import { cn } from '@/lib/utils'
import { fetchUnreadAnnouncementCount } from '@/lib/announcements/queries'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { fetchUnreadStudyFeedbackCount } from '@/lib/study/feedback-queries'
import { fetchUnseenTextbookCount } from '@/lib/textbooks/catalog-queries'
import { HamburgerMenu } from '@/components/layout/HamburgerMenu'
import { RecordStudentPageVisit } from '@/components/achievements/RecordStudentPageVisit'
import {
  STUDENT_HAMBURGER_ITEMS,
  type HamburgerMenuItem,
} from '@/components/layout/menu-items'

interface StudentPageShellProps {
  title: string
  backHref?: string
  backLabel?: string
  mainClassName?: string
  children: ReactNode
}

function getHamburgerBadgeCount(
  href: string,
  unreadAnnouncementCount: number,
  unreadChatCount: number,
  unreadStudyFeedbackCount: number,
  unseenTextbookCount: number,
): number | undefined {
  if (href === '/dashboard/announcements' && unreadAnnouncementCount > 0) {
    return unreadAnnouncementCount
  }
  if (href === '/dashboard/chat' && unreadChatCount > 0) {
    return unreadChatCount
  }
  if (href === '/dashboard/study/history' && unreadStudyFeedbackCount > 0) {
    return unreadStudyFeedbackCount
  }
  if (href === '/dashboard/bookshelf' && unseenTextbookCount > 0) {
    return unseenTextbookCount
  }
  return undefined
}

export async function StudentPageShell({
  title,
  backHref,
  backLabel,
  mainClassName,
  children,
}: StudentPageShellProps) {
  const profile = await getCurrentProfile()
  const [unreadAnnouncementCount, unreadChatCount, unreadStudyFeedbackCount, unseenTextbookCount] =
    profile
      ? await Promise.all([
          fetchUnreadAnnouncementCount(profile.id).catch(() => 0),
          fetchUnreadChatCount(profile.id).catch(() => 0),
          fetchUnreadStudyFeedbackCount(profile.id).catch(() => 0),
          profile.role === 'student'
            ? fetchUnseenTextbookCount(profile.id).catch(() => 0)
            : Promise.resolve(0),
        ])
      : [0, 0, 0, 0]

  const menuItems: HamburgerMenuItem[] = STUDENT_HAMBURGER_ITEMS.map((item) => ({
    ...item,
    badgeCount: getHamburgerBadgeCount(
      item.href,
      unreadAnnouncementCount,
      unreadChatCount,
      unreadStudyFeedbackCount,
      unseenTextbookCount,
    ),
  }))

  const welcomeName = profile ? getPersonName(profile) : null

  return (
    <div className="min-h-dvh">
      <RecordStudentPageVisit />
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {backHref && (
              <Link href={backHref} className="text-sm text-primary hover:underline">
                ← {backLabel ?? '戻る'}
              </Link>
            )}
            <p className="text-sm text-muted">受験生web</p>
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {welcomeName && (
              <p className="max-w-[9rem] truncate text-sm text-muted sm:max-w-none">
                ようこそ{' '}
                <span className="font-medium text-foreground">{welcomeName}</span>
                さん
              </p>
            )}
            <HamburgerMenu items={menuItems} />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto max-w-3xl px-4 py-8', mainClassName)}>{children}</main>
    </div>
  )
}
