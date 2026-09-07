import { requireKisotsuStudentOrRedirect } from '@/lib/class-schedule/access'
import {
  fetchNextClassDay,
  fetchUpcomingClassScheduleDays,
} from '@/lib/class-schedule/queries'
import { getJstDateKey } from '@/lib/study/dates'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import {
  StudentClassScheduleDayCards,
  StudentClassScheduleNextHero,
  StudentClassSchedulePastLink,
} from '@/components/class-schedule/StudentClassScheduleViews'

export const dynamic = 'force-dynamic'

export default async function StudentClassSchedulePage() {
  await requireKisotsuStudentOrRedirect()
  const todayKey = getJstDateKey()

  const [next, upcoming] = await Promise.all([
    fetchNextClassDay(todayKey),
    fetchUpcomingClassScheduleDays({ todayKey, limit: 30 }),
  ])

  return (
    <StudentPageShell title="授業予定" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <StudentClassScheduleNextHero next={next} />
        <section className="space-y-3">
          <h2 className="text-lg font-bold">今後の予定</h2>
          <StudentClassScheduleDayCards
            days={upcoming}
            emptyMessage="今後の授業予定はありません。"
          />
        </section>
        <StudentClassSchedulePastLink />
      </div>
    </StudentPageShell>
  )
}
