'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import { FaqIntroDialog } from '@/components/faq/FaqIntroDialog'
import { StudyLogModeDialog } from '@/components/study/StudyLogModeDialog'
import {
  MYPAGE_MENU_ICONS,
  MyPageIconMenuButton,
  MyPagePrimaryActionButton,
} from '@/components/student/MyPageMenuButtons'
import { StarRankingBanner } from '@/components/student/StarRankingBanner'
import type { StudentStarRanking } from '@/lib/achievements/ranking'
import { formatStudyStreakLabel } from '@/lib/study/streak'

type MenuBadgeKey = 'studyHistory' | 'announcements' | 'chat' | 'bookshelf' | 'faqIntro' | 'todo'

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
    href: '/dashboard/achievements',
    label: '実績一覧',
    iconSrc: MYPAGE_MENU_ICONS.achievements,
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
    badgeKey: 'todo',
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
  {
    href: '/dashboard/faq',
    label: 'FAQ',
    iconSrc: MYPAGE_MENU_ICONS.faq,
    badgeKey: 'faqIntro',
  },
]

interface MyPageActionsProps {
  starRanking?: StudentStarRanking | null
  nextCoaching?: CoachingBookingWithDetails | null
  studyStreakDays?: number
  unreadStudyFeedbackCount?: number
  unreadAnnouncementCount?: number
  unreadChatCount?: number
  unseenTextbookCount?: number
  incompleteTodoCount?: number
  hideClassSchedule?: boolean
  showFaqIntro?: boolean
}

export function MyPageActions({
  starRanking,
  nextCoaching,
  studyStreakDays = 0,
  unreadStudyFeedbackCount = 0,
  unreadAnnouncementCount = 0,
  unreadChatCount = 0,
  unseenTextbookCount = 0,
  incompleteTodoCount = 0,
  hideClassSchedule = false,
  showFaqIntro = false,
}: MyPageActionsProps) {
  const [studyDialogOpen, setStudyDialogOpen] = useState(false)
  const badgeCounts: Record<MenuBadgeKey, number> = {
    studyHistory: unreadStudyFeedbackCount,
    announcements: unreadAnnouncementCount,
    chat: unreadChatCount,
    bookshelf: unseenTextbookCount,
    faqIntro: showFaqIntro ? 1 : 0,
    todo: incompleteTodoCount,
  }

  const visibleMenuActions = hideClassSchedule
    ? iconMenuActions.filter((action) => action.label !== '授業予定')
    : iconMenuActions

  const studyStreakLabel = formatStudyStreakLabel(studyStreakDays)

  return (
    <div className="space-y-3">
      <FaqIntroDialog open={showFaqIntro} />
      <StudyLogModeDialog open={studyDialogOpen} onClose={() => setStudyDialogOpen(false)} />

      <div className="space-y-2">
        {starRanking && <StarRankingBanner ranking={starRanking} />}

        {nextCoaching ? (
        <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-muted">次回コーチング</h2>
              <p className="mt-0.5 truncate text-sm font-bold">
                {formatCoachingBookingDateTime(
                  nextCoaching.slot.slot_date,
                  nextCoaching.slot.start_time,
                  nextCoaching.slot.starts_at,
                  nextCoaching.slot.ends_at,
                )}
              </p>
              <p className="truncate text-xs text-muted">{nextCoaching.coach.name}</p>
            </div>
            <Link
              href="/dashboard/coaching"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              変更 →
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold text-muted">次回コーチング</h2>
              <p className="mt-0.5 text-sm font-medium">予約がありません</p>
            </div>
            <Link
              href="/dashboard/coaching"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              予約 →
            </Link>
          </div>
        </section>
      )}
      </div>

      <MyPagePrimaryActionButton
        label="学習を記録する"
        subtitle={studyStreakLabel}
        iconSrc={MYPAGE_MENU_ICONS.recordStudy}
        onClick={() => setStudyDialogOpen(true)}
      />

      <div className="grid grid-cols-3 gap-3">
        {visibleMenuActions.map((action) => (
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