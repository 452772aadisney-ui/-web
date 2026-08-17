import { MyPageIconMenuButton } from '@/components/student/MyPageMenuButtons'

export const ADMIN_MYPAGE_MENU_ICONS = {
  students: '/icons/admin-mypage/students.png',
  dailyManagement: '/icons/admin-mypage/daily-management.png',
  schedule: '/icons/admin-mypage/schedule.png',
  quiz: '/icons/admin-mypage/quiz.png',
  coaching: '/icons/admin-mypage/coaching.png',
  bookshelf: '/icons/admin-mypage/bookshelf.png',
  announcements: '/icons/admin-mypage/announcements.png',
  message: '/icons/admin-mypage/message.png',
} as const

type AdminMenuBadgeKey = 'studyDaily' | 'chat'

const menuActions: Array<{
  href: string
  label: string
  iconSrc: string
  badgeKey?: AdminMenuBadgeKey
}> = [
  {
    href: '/admin/students',
    label: '生徒一覧',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.students,
  },
  {
    href: '/admin/study-daily',
    label: '毎日管理',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.dailyManagement,
    badgeKey: 'studyDaily',
  },
  {
    href: '/admin/schedule',
    label: 'スケジュール登録',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.schedule,
  },
  {
    href: '/admin/quizzes',
    label: '小テスト',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.quiz,
  },
  {
    href: '/admin/coaching',
    label: 'コーチング',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.coaching,
  },
  {
    href: '/admin/bookshelf',
    label: '本棚',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.bookshelf,
  },
  {
    href: '/admin/announcements',
    label: 'お知らせ登録',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.announcements,
  },
  {
    href: '/admin/chat',
    label: 'メッセージ',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.message,
    badgeKey: 'chat',
  },
]

interface AdminMyPageActionsProps {
  unreadChatCount?: number
  incompleteStudyFeedbackCount?: number
}

export function AdminMyPageActions({
  unreadChatCount = 0,
  incompleteStudyFeedbackCount = 0,
}: AdminMyPageActionsProps) {
  const badgeCounts: Record<AdminMenuBadgeKey, number> = {
    studyDaily: incompleteStudyFeedbackCount,
    chat: unreadChatCount,
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {menuActions.map((action) => (
        <MyPageIconMenuButton
          key={action.href}
          href={action.href}
          label={action.label}
          iconSrc={action.iconSrc}
          badgeCount={action.badgeKey ? badgeCounts[action.badgeKey] : undefined}
        />
      ))}
    </div>
  )
}
