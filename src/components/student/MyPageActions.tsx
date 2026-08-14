import Link from 'next/link'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import {
  MYPAGE_MENU_ICONS,
  MyPageIconMenuButton,
  MyPagePrimaryActionButton,
} from '@/components/student/MyPageMenuButtons'

type MenuBadgeKey = 'studyHistory' | 'announcements' | 'chat'

const iconMenuActions: Array<{
  href: string
  label: string
  iconSrc: string
  badgeKey?: MenuBadgeKey
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
]

interface MyPageActionsProps {
  nextCoaching?: CoachingBookingWithDetails | null
  unreadStudyFeedbackCount?: number
  unreadAnnouncementCount?: number
  unreadChatCount?: number
}

export function MyPageActions({
  nextCoaching,
  unreadStudyFeedbackCount = 0,
  unreadAnnouncementCount = 0,
  unreadChatCount = 0,
}: MyPageActionsProps) {
  const badgeCounts: Record<MenuBadgeKey, number> = {
    studyHistory: unreadStudyFeedbackCount,
    announcements: unreadAnnouncementCount,
    chat: unreadChatCount,
  }

  return (
    <div className="space-y-4">
      {nextCoaching && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-muted">次回コーチング予定</h2>
          <p className="mt-2 font-bold">{nextCoaching.coach.name}</p>
          <p className="mt-1 text-sm text-muted">
            {formatCoachingBookingDateTime(
              nextCoaching.slot.slot_date,
              nextCoaching.slot.start_time,
              nextCoaching.slot.starts_at,
              nextCoaching.slot.ends_at,
            )}
          </p>
          <Link
            href="/dashboard/coaching"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            コーチング詳細を見る →
          </Link>
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
          />
        ))}
      </div>
    </div>
  )
}
