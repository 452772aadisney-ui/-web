import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingSlotsManager } from '@/components/coaching/AdminCoachingSlotsManager'
import { fetchCoachingCoaches, fetchCoachingGridForWeek } from '@/lib/coaching/queries'
import { getWeekStartMonday, parseDateKey } from '@/lib/coaching/week'

export default async function AdminCoachingSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; week?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const weekStart = params.week
    ? getWeekStartMonday(parseDateKey(params.week))
    : getWeekStartMonday()

  const coaches = await fetchCoachingCoaches()
  const activeCoaches = coaches.filter((c) => c.is_active)
  const selectedCoachId =
    params.coach && activeCoaches.some((c) => c.id === params.coach)
      ? params.coach
      : activeCoaches[0]?.id ?? null

  const gridSlots = selectedCoachId
    ? await fetchCoachingGridForWeek(selectedCoachId, weekStart)
    : []

  return (
    <AdminPageShell title="枠設定" backHref="/admin/coaching" backLabel="コーチング">
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        担当講師ごとに週間グリッドから予約枠を開放します。生徒には開放された枠だけが表示されます。
      </p>
      <AdminCoachingSlotsManager
        coaches={coaches}
        selectedCoachId={selectedCoachId}
        weekStart={weekStart}
        gridSlots={gridSlots}
      />
    </AdminPageShell>
  )
}
