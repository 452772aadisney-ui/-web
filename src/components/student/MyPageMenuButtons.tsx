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
} as const

interface MyPagePrimaryActionButtonProps {
  href: string
  label: string
  iconSrc: string
}

export function MyPagePrimaryActionButton({
  href,
  label,
  iconSrc,
}: MyPagePrimaryActionButtonProps) {
  return (
    <Link
      href={href}
      className="flex min-h-[5.5rem] items-center justify-center gap-3 rounded-2xl bg-[#1a1f36] px-6 py-6 text-lg font-bold text-white shadow-sm transition hover:bg-[#252b45]"
    >
      <Image
        src={iconSrc}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 brightness-0 invert"
        aria-hidden
      />
      {label}
    </Link>
  )
}

interface MyPageIconMenuButtonProps {
  href: string
  label: string
  iconSrc: string
  badgeCount?: number
  className?: string
  openInNewTab?: boolean
  externalConfirmMessage?: string
}

export function MyPageIconMenuButton({
  href,
  label,
  iconSrc,
  badgeCount,
  className,
  openInNewTab,
  externalConfirmMessage,
}: MyPageIconMenuButtonProps) {
  const buttonClassName = cn(
    'relative flex min-h-[5.75rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-4 text-center shadow-sm transition hover:bg-background',
    className,
  )

  const content = (
    <>
      <Image src={iconSrc} alt="" width={40} height={40} className="h-10 w-10" aria-hidden />
      <span className="text-sm font-medium leading-tight">{label}</span>
      {badgeCount != null && badgeCount > 0 && (
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </>
  )

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
      href={href}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      className={buttonClassName}
    >
      {content}
    </Link>
  )
}
