import { requireKisotsuStudentOrRedirect } from '@/lib/class-schedule/access'
import {
  fetchMyTargetedClassScheduleSessionIds,
  fetchStudentClassScheduleOverview,
  getJstWallClockHHmm,
  upcomingClassScheduleEmptyMessage,
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
  const nowTimeHHmm = getJstWallClockHHmm()

  const [{ next, upcoming }, targetSessionIds] = await Promise.all([
    fetchStudentClassScheduleOverview({
      todayKey,
      nowTimeHHmm,
      limit: 90,
    }),
    fetchMyTargetedClassScheduleSessionIds(),
  ])

  return (
    <StudentPageShell title="授業予定" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <StudentClassScheduleNextHero
          next={next}
          todayKey={todayKey}
          nowTimeHHmm={nowTimeHHmm}
          viewerTargetSessionIds={targetSessionIds}
        />
        <section className="space-y-3">
          <h2 className="text-lg font-bold">今後の予定</h2>
          <StudentClassScheduleDayCards
            days={upcoming}
            emptyMessage={upcomingClassScheduleEmptyMessage(Boolean(next))}
            viewerTargetSessionIds={targetSessionIds}
          />
        </section>
        <StudentClassSchedulePastLink />
      </div>
    </StudentPageShell>
  )
}
