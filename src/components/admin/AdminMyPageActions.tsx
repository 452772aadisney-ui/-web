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
  achievements: '/icons/mypage/achievements.png',
  other: '/icons/mypage/faq.png',
} as const

type AdminMenuBadgeKey = 'studyDaily' | 'chat'

const menuActions: Array<{
  href: string
  label: string
  description: string
  iconSrc: string
  badgeKey?: AdminMenuBadgeKey
}> = [
  {
    href: '/admin/students',
    label: '生徒一覧',
    description: '生徒の検索・詳細',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.students,
  },
  {
    href: '/admin/study-daily',
    label: '毎日管理',
    description: '学習記録の確認',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.dailyManagement,
    badgeKey: 'studyDaily',
  },
  {
    href: '/admin/coaching',
    label: 'コーチング',
    description: '枠・予約・カルテ',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.coaching,
  },
  {
    href: '/admin/schedule',
    label: 'スケジュール',
    description: '予定・課題の登録',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.schedule,
  },
  {
    href: '/admin/quizzes',
    label: '小テスト',
    description: '作成・点数入力',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.quiz,
  },
  {
    href: '/admin/bookshelf',
    label: '本棚',
    description: '参考書マスタ管理',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.bookshelf,
  },
  {
    href: '/admin/chat',
    label: 'メッセージ',
    description: '生徒とのやりとり',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.message,
    badgeKey: 'chat',
  },
  {
    href: '/admin/announcements',
    label: 'お知らせ',
    description: '配信・既読確認',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.announcements,
  },
  {
    href: '/admin/achievements',
    label: '実績・順位',
    description: 'ランキング確認',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.achievements,
  },
  {
    href: '/admin/faq',
    label: 'その他',
    description: 'FAQ・タグ管理',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.other,
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
    <div className="grid grid-cols-3 gap-3 md:grid-cols-4 md:gap-4">
      {menuActions.map((action) => (
        <MyPageIconMenuButton
          key={action.href}
          href={action.href}
          label={action.label}
          iconSrc={action.iconSrc}
          subtitle={action.description}
          subtitleClassName="hidden line-clamp-2 sm:block"
          className="min-h-[6.25rem] gap-1.5 px-2 sm:min-h-[7.25rem] sm:px-3"
          badgeCount={action.badgeKey ? badgeCounts[action.badgeKey] : undefined}
        />
      ))}
    </div>
  )
}
