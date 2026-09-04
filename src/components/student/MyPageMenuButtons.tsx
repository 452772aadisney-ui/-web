'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const MYPAGE_MENU_ICONS = {
  recordStudy: '/icons/mypage/record-study.png',
  studyHistory: '/icons/mypage/study-history.png',
  bookshelf: '/icons/mypage/bookshelf.png',
  textbookRegister: '/icons/mypage/textbook-register.png',
  calendar: '/icons/mypage/calendar.png',
  classSchedule: '/icons/mypage/class-schedule.png',
  todo: '/icons/mypage/todo.png',
  message: '/icons/mypage/message.png',
  announcements: '/icons/mypage/announcements.png',
  faq: '/icons/mypage/faq.png',
  achievements: '/icons/mypage/achievements.png',
  quiz: '/icons/mypage/quiz.png',
} as const

interface MyPagePrimaryActionButtonProps {
  href?: string
  label: string
  iconSrc: string
  subtitle?: string | null
  subtitleTone?: 'default' | 'empty' | 'recorded'
  onClick?: () => void
}

export function MyPagePrimaryActionButton({
  href,
  label,
  iconSrc,
  subtitle,
  subtitleTone = 'default',
  onClick,
}: MyPagePrimaryActionButtonProps) {
  const className =
    'flex min-h-[5.5rem] w-full items-center justify-center gap-3 rounded-2xl bg-[#1a1f36] px-4 py-6 text-lg font-bold text-white shadow-sm transition hover:bg-[#252b45] active:scale-[0.95] active:bg-[#12162a] sm:px-6'

  const subtitleClassName =
    subtitleTone === 'empty'
      ? 'text-sm font-semibold leading-snug text-amber-300'
      : subtitleTone === 'recorded'
        ? 'text-sm font-semibold leading-snug text-emerald-300'
        : 'text-sm font-semibold leading-snug text-amber-300'

  const content = (
    <>
      <Image
        src={iconSrc}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 brightness-0 invert"
        aria-hidden
      />
      <span className="flex min-w-0 flex-col items-center gap-1 text-center">
        <span>{label}</span>
        {subtitle && (
          <span className={subtitleClassName}>
            {subtitleTone === 'recorded' ? `✓ ${subtitle}` : subtitle}
          </span>
        )}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }

  return (
    <Link href={href ?? '#'} className={className}>
      {content}
    </Link>
  )
}

interface MyPageIconMenuButtonProps {
  href?: string
  label: string
  iconSrc: string
  badgeCount?: number
  /** When set, shown instead of a numeric-only badge (e.g. 期限超過 2件). */
  badgeLabel?: string
  subtitle?: string
  subtitleClassName?: string
  className?: string
  openInNewTab?: boolean
  externalConfirmMessage?: string
  onClick?: () => void
}

export function MyPageIconMenuButton({
  href,
  label,
  iconSrc,
  badgeCount,
  badgeLabel,
  subtitle,
  subtitleClassName,
  className,
  openInNewTab,
  externalConfirmMessage,
  onClick,
}: MyPageIconMenuButtonProps) {
  const buttonClassName = cn(
    'relative flex h-full min-h-[5.75rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-4 pt-5 text-center shadow-sm transition hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.92] active:border-primary/30 active:bg-primary/10',
    className,
  )

  const showBadge = Boolean(badgeLabel) || (badgeCount != null && badgeCount > 0)

  const content = (
    <>
      <Image src={iconSrc} alt="" width={40} height={40} className="h-10 w-10 shrink-0" aria-hidden />
      <span className="text-sm font-medium leading-tight">{label}</span>
      {subtitle && (
        <span
          className={cn('text-[10px] leading-tight text-muted', subtitleClassName)}
        >
          {subtitle}
        </span>
      )}
      {showBadge && (
        <span
          className={cn(
            'absolute right-1.5 top-1.5 z-10 flex min-h-5 max-w-[calc(100%-0.75rem)] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white',
            badgeLabel ? 'py-1 text-left' : 'min-w-5',
          )}
        >
          {badgeLabel
            ? badgeLabel
            : badgeCount != null && badgeCount > 99
              ? '99+'
              : badgeCount}
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={buttonClassName}>
        {content}
      </button>
    )
  }

  if (externalConfirmMessage) {
    return (
      <button
        type="button"
        onClick={() => {
          if (window.confirm(externalConfirmMessage)) {
            window.open(href, '_blank', 'noopener,noreferrer')
          }
        }}
        className={buttonClassName}
      >
        {content}
      </button>
    )
  }

  return (
    <Link
      href={href ?? '#'}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      className={buttonClassName}
    >
      {content}
    </Link>
  )
}
