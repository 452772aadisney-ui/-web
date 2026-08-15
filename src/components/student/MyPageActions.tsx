'use client'

import Link from 'next/link'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import {
  MYPAGE_MENU_ICONS,
  MyPageIconMenuButton,
  MyPagePrimaryActionButton,
} from '@/components/student/MyPageMenuButtons'

type MenuBadgeKey = 'studyHistory' | 'announcements' | 'chat' | 'bookshelf'

const iconMenuActions: Array<{
  href: string
  label: string
  iconSrc: string
  badgeKey?: MenuBadgeKey
  openInNewTab?: boolean
  externalConfirmMessage?: string
}> = [
  {
    href: '/dashboard/study/history',
    label: '学習履歴',
    iconSrc: MYPAGE_MENU_ICONS.studyHistory,
    badgeKey: 'studyHistory',
  },
  {
    href: '/dashboard/bookshelf',
    label: '本棚',
    iconSrc: MYPAGE_MENU_ICONS.bookshelf,
    badgeKey: 'bookshelf',
  },
  {
    href: '/dashboard/textbooks/register',
    label: '教材登録',
    iconSrc: MYPAGE_MENU_ICONS.textbookRegister,
  },
  {
    href: '/dashboard/calendar',
    label: 'カレンダー',
    iconSrc: MYPAGE_MENU_ICONS.calendar,
  },
  {
    href: '/dashboard/todo',
    label: 'ToDo',
    iconSrc: MYPAGE_MENU_ICONS.todo,
  },
  {
    href: '/dashboard/announcements',
    label: 'お知らせ',
    iconSrc: MYPAGE_MENU_ICONS.announcements,
    badgeKey: 'announcements',
  },
  {
    href: '/dashboard/chat',
    label: 'メッセージ',
    iconSrc: MYPAGE_MENU_ICONS.message,
    badgeKey: 'chat',
  },
  {
    href: 'https://mates.students-web.jp/sign-in',
    label: '授業予定',
    iconSrc: MYPAGE_MENU_ICONS.classSchedule,
    externalConfirmMessage: '生徒web(外部リンク)を開きます',
  },
]

interface MyPageActionsProps {
  nextCoaching?: CoachingBookingWithDetails | null
  unreadStudyFeedbackCount?: number
  unreadAnnouncementCount?: number
  unreadChatCount?: number
  unseenTextbookCount?: number
}

export function MyPageActions({
  nextCoaching,
  unreadStudyFeedbackCount = 0,
  unreadAnnouncementCount = 0,
  unreadChatCount = 0,
  unseenTextbookCount = 0,
}: MyPageActionsProps) {
  const badgeCounts: Record<MenuBadgeKey, number> = {
    studyHistory: unreadStudyFeedbackCount,
    announcements: unreadAnnouncementCount,
    chat: unreadChatCount,
    bookshelf: unseenTextbookCount,
  }

  return (
    <div className="space-y-4">
      {nextCoaching ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-center text-sm font-semibold text-muted">次回コーチング予定</h2>
          <p className="mt-3 text-center text-lg font-bold">
            {formatCoachingBookingDateTime(
              nextCoaching.slot.slot_date,
              nextCoaching.slot.start_time,
              nextCoaching.slot.starts_at,
              nextCoaching.slot.ends_at,
            )}
          </p>
          <p className="mt-1 text-center text-sm text-muted">{nextCoaching.coach.name}</p>
          <div className="mt-3 text-center">
            <Link
              href="/dashboard/coaching"
              className="text-sm font-medium text-primary hover:underline"
            >
              コーチング予定を変更する →
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-center text-sm font-semibold text-muted">次回コーチング予定</h2>
          <p className="mt-3 text-center font-medium">次回コーチングを予約してください</p>
          <div className="mt-3 text-center">
            <Link
              href="/dashboard/coaching"
              className="text-sm font-medium text-primary hover:underline"
            >
              コーチングを予約する →
            </Link>
          </div>
        </section>
      )}

      <MyPagePrimaryActionButton
        href="/dashboard/study"
        label="学習を記録する"
        iconSrc={MYPAGE_MENU_ICONS.recordStudy}
      />

      <div className="grid grid-cols-3 gap-3">
        {iconMenuActions.map((action) => (
          <MyPageIconMenuButton
            key={action.href}
            href={action.href}
            label={action.label}
            iconSrc={action.iconSrc}
            badgeCount={action.badgeKey ? badgeCounts[action.badgeKey] : undefined}
            openInNewTab={action.openInNewTab}
            externalConfirmMessage={action.externalConfirmMessage}
          />
        ))}
      </div>
    </div>
  )
}
