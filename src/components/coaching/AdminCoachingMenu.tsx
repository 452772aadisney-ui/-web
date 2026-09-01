import Link from 'next/link'
import { MyPageIconMenuButton } from '@/components/student/MyPageMenuButtons'
import { ADMIN_MYPAGE_MENU_ICONS } from '@/components/admin/AdminMyPageActions'

const menuItems = [
  {
    href: '/admin/coaching/slots',
    label: '枠設定',
    description: '予約枠の開放設定',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.schedule,
  },
  {
    href: '/admin/coaching/instructors',
    label: '講師追加',
    description: '担当講師の追加・編集',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.students,
  },
  {
    href: '/admin/coaching/bookings',
    label: '予約確認',
    description: '予約の確認・完了',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.coaching,
  },
  {
    href: '/admin/coaching/karte',
    label: 'カルテ',
    description: '面談記録の入力・閲覧',
    iconSrc: ADMIN_MYPAGE_MENU_ICONS.dailyManagement,
  },
] as const

export function AdminCoachingMenu() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {menuItems.map((item) => (
        <MyPageIconMenuButton
          key={item.href}
          href={item.href}
          label={item.label}
          iconSrc={item.iconSrc}
        />
      ))}
    </div>
  )
}

export function AdminCoachingMenuDescriptions() {
  return (
    <ul className="mt-6 space-y-2 text-sm text-muted">
      {menuItems.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="font-medium text-foreground hover:text-primary">
            {item.label}
          </Link>
          {' — '}
          {item.description}
        </li>
      ))}
    </ul>
  )
}
