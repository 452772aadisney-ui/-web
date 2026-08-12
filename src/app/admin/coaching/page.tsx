import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingManager } from '@/components/coaching/AdminCoachingManager'
import {
  fetchCoachingBookingsForAdmin,
  fetchCoachingCoaches,
  fetchCoachingGridForWeek,
} from '@/lib/coaching/queries'
import { getWeekStartMonday } from '@/lib/coaching/week'

export default async function AdminCoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ coach?: string; week?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const weekStart = params.week ?? getWeekStartMonday()

  const [coaches, bookings] = await Promise.all([
    fetchCoachingCoaches(),
    fetchCoachingBookingsForAdmin(),
  ])

  const activeCoaches = coaches.filter((c) => c.is_active)
  const selectedCoachId =
    params.coach && activeCoaches.some((c) => c.id === params.coach)
      ? params.coach
      : activeCoaches[0]?.id ?? null

  const gridSlots = selectedCoachId
    ? await fetchCoachingGridForWeek(selectedCoachId, weekStart)
    : []

  return (
    <AdminPageShell title="コーチング予約" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        担当講師ごとに週間グリッドから予約枠を開放します。生徒には開放された枠だけが表示されます。
      </p>
      <AdminCoachingManager
        coaches={coaches}
        selectedCoachId={selectedCoachId}
        weekStart={weekStart}
        gridSlots={gridSlots}
        bookings={bookings}
      />
    </AdminPageShell>
  )
}
