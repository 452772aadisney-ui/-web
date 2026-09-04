'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import { FaqIntroDialog } from '@/components/faq/FaqIntroDialog'
import { StudyLogModeDialog } from '@/components/study/StudyLogModeDialog'
import { TextbookRegisterModeDialog } from '@/components/textbooks/TextbookRegisterModeDialog'
import { CoachingAlertBanner } from '@/components/coaching/CoachingAlertBanner'
import { OnboardingChecklist } from '@/components/student/OnboardingChecklist'
import {
  MYPAGE_MENU_ICONS,
  MyPageIconMenuButton,
  MyPagePrimaryActionButton,
} from '@/components/student/MyPageMenuButtons'
import { StarRankingBanner } from '@/components/student/StarRankingBanner'
import { CommonTestCountdownBanner } from '@/components/student/CommonTestCountdownBanner'
import type { StudentStarRanking } from '@/lib/achievements/ranking'
import type { OnboardingChecklistItem } from '@/lib/student/onboarding-checklist'
import { formatTodayStudyButtonSubtitle } from '@/lib/study/today-status'

type MenuBadgeKey = 'studyHistory' | 'announcements' | 'chat' | 'bookshelf' | 'faqIntro' | 'todo'

/** Daily-use menu cards first, then secondary helpers. */
const iconMenuActions: Array<{
  href?: string
  label: string
  iconSrc: string
  badgeKey?: MenuBadgeKey
  subtitle?: string
  openInNewTab?: boolean
  externalConfirmMessage?: string
  opensTextbookRegisterDialog?: boolean
}> = [
  {
    href: '/dashboard/study/history',
    label: '学習履歴',
    iconSrc: MYPAGE_MENU_ICONS.studyHistory,
    badgeKey: 'studyHistory',
  },
  {
    href: '/dashboard/bookshelf',
    label: 'My本棚',
    iconSrc: MYPAGE_MENU_ICONS.bookshelf,
    badgeKey: 'bookshelf',
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
    label: '教材登録',
    iconSrc: MYPAGE_MENU_ICONS.textbookRegister,
    opensTextbookRegisterDialog: true,
  },
  {
    href: '/dashboard/announcements',
    label: 'お知らせ',
    iconSrc: MYPAGE_MENU_ICONS.announcements,
    badgeKey: 'announcements',
  },
  {
    href: 'https://mates.students-web.jp/sign-in',
    label: '授業予定',
    iconSrc: MYPAGE_MENU_ICONS.classSchedule,
    externalConfirmMessage: '生徒web(外部リンク)を開きます',
  },
  {
    href: '/dashboard/chat',
    label: 'メッセージ',
    iconSrc: MYPAGE_MENU_ICONS.message,
    badgeKey: 'chat',
  },
  {
    href: '/dashboard/achievements',
    label: '実績一覧',
    iconSrc: MYPAGE_MENU_ICONS.achievements,
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
  coachingAlertMessage?: string | null
  commonTestDaysRemaining?: number | null
  todayStudyMinutes?: number
  onboardingItems?: OnboardingChecklistItem[]
  unreadStudyFeedbackCount?: number
  unreadAnnouncementCount?: number
  unreadChatCount?: number
  unseenTextbookCount?: number
  incompleteTodoCount?: number
  overdueTodoCount?: number
  hideClassSchedule?: boolean
  hideCoaching?: boolean
  showFaqIntro?: boolean
}

export function MyPageActions({
  starRanking,
  nextCoaching,
  coachingAlertMessage = null,
  commonTestDaysRemaining = null,
  todayStudyMinutes = 0,
  onboardingItems = [],
  unreadStudyFeedbackCount = 0,
  unreadAnnouncementCount = 0,
  unreadChatCount = 0,
  unseenTextbookCount = 0,
  incompleteTodoCount = 0,
  overdueTodoCount = 0,
  hideClassSchedule = false,
  hideCoaching = false,
  showFaqIntro = false,
}: MyPageActionsProps) {
  const [studyDialogOpen, setStudyDialogOpen] = useState(false)
  const [textbookRegisterDialogOpen, setTextbookRegisterDialogOpen] = useState(false)
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

  const todayStudyStatus = formatTodayStudyButtonSubtitle(todayStudyMinutes)
  const showCommonTestCountdown = commonTestDaysRemaining !== null
  const showNextCoachingBanner = !hideCoaching && !coachingAlertMessage
  const showOnboarding = onboardingItems.some((item) => !item.completed)

  return (
    <div className="space-y-3">
      <FaqIntroDialog open={showFaqIntro} />
      <StudyLogModeDialog open={studyDialogOpen} onClose={() => setStudyDialogOpen(false)} />
      <TextbookRegisterModeDialog
        open={textbookRegisterDialogOpen}
        onClose={() => setTextbookRegisterDialogOpen(false)}
      />

      {coachingAlertMessage && <CoachingAlertBanner message={coachingAlertMessage} />}

      <div className="space-y-1">
        {showCommonTestCountdown ? (
          <div className="grid grid-cols-2 gap-2">
            {starRanking && <StarRankingBanner ranking={starRanking} className="min-w-0" />}
            <CommonTestCountdownBanner
              daysRemaining={commonTestDaysRemaining}
              className="min-w-0"
            />
          </div>
        ) : (
          starRanking && <StarRankingBanner ranking={starRanking} />
        )}

        {showNextCoachingBanner &&
          (nextCoaching ? (
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
          ))}
      </div>

      {showOnboarding && <OnboardingChecklist items={onboardingItems} />}

      <MyPagePrimaryActionButton
        label="学習を記録する"
        subtitle={todayStudyStatus.text}
        subtitleTone={todayStudyStatus.tone}
        iconSrc={MYPAGE_MENU_ICONS.recordStudy}
        onClick={() => setStudyDialogOpen(true)}
      />

      <div className="grid grid-cols-3 gap-3">
        {visibleMenuActions.map((action) => {
          const count = action.badgeKey ? badgeCounts[action.badgeKey] : undefined
          const todoBadgeLabel =
            action.badgeKey === 'todo' && overdueTodoCount > 0
              ? `期限超過 ${overdueTodoCount}件`
              : undefined

          return (
            <MyPageIconMenuButton
              key={action.label}
              href={action.href}
              label={action.label}
              iconSrc={action.iconSrc}
              subtitle={action.subtitle}
              badgeCount={todoBadgeLabel ? undefined : count}
              badgeLabel={todoBadgeLabel}
              openInNewTab={action.openInNewTab}
              externalConfirmMessage={action.externalConfirmMessage}
              onClick={
                action.opensTextbookRegisterDialog
                  ? () => setTextbookRegisterDialogOpen(true)
                  : undefined
              }
            />
          )
        })}
      </div>
    </div>
  )
}
