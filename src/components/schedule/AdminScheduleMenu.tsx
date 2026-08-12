import Link from 'next/link'

const SCHEDULE_MENU_ITEMS = [
  {
    href: '/admin/schedule/quiz',
    title: '小テスト登録',
    description: '小テストの日程を生徒ごとに登録します。',
    color: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  {
    href: '/admin/schedule/homework',
    title: '課題登録',
    description: '教科別の課題・宿題を期日付きで登録します。',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    href: '/admin/schedule/application',
    title: '申込・タスク登録',
    description: '出願・申込などの期限付きタスクを登録します。',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  {
    href: '/admin/schedule/mock-exam',
    title: '模試登録',
    description: '受験日と返却日を登録します。両方が生徒のカレンダーに表示されます。',
    color: 'bg-red-50 text-red-800 border-red-200',
  },
] as const

export function AdminScheduleMenu() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {SCHEDULE_MENU_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${item.color}`}
          >
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="mt-2 text-sm opacity-90">{item.description}</p>
            <p className="mt-4 text-sm font-medium">登録画面へ →</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
