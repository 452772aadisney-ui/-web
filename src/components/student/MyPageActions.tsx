import Link from 'next/link'

const secondaryActions = [
  { href: '/dashboard/bookshelf', label: '本棚を見る' },
  { href: '/dashboard/calendar', label: 'カレンダーを確認する' },
  { href: '/dashboard/todo', label: 'ToDoリストを確認する' },
  { href: '/dashboard/coaching', label: 'コーチングを予約する' },
] as const

const actionClass =
  'flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-border bg-card px-4 py-4 text-center text-sm font-medium shadow-sm transition hover:bg-background'

export function MyPageActions() {
  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/study"
        className="flex min-h-[5.5rem] items-center justify-center rounded-2xl bg-[#1a1f36] px-6 py-6 text-center text-lg font-bold text-white shadow-sm transition hover:bg-[#252b45]"
      >
        学習を記録する
      </Link>

      <div className="grid grid-cols-2 gap-3">
        {secondaryActions.map((action) => (
          <Link key={action.href} href={action.href} className={actionClass}>
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
