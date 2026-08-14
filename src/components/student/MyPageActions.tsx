import Link from 'next/link'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import type { CoachingBookingWithDetails } from '@/types/coaching'

const secondaryActions = [
  { href: '/dashboard/study/history', label: '学習履歴を見る' },
  { href: '/dashboard/bookshelf', label: '本棚を見る' },
  { href: '/dashboard/calendar', label: 'カレンダーを確認する' },
  { href: '/dashboard/todo', label: 'ToDoリストを確認する' },
  { href: '/dashboard/coaching', label: 'コーチングを予約する' },
] as const

const actionClass =
  'flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-border bg-card px-4 py-4 text-center text-sm font-medium shadow-sm transition hover:bg-background'

interface MyPageActionsProps {
  nextCoaching?: CoachingBookingWithDetails | null
}

export function MyPageActions({ nextCoaching }: MyPageActionsProps) {
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
