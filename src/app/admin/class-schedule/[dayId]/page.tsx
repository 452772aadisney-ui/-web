import { notFound } from 'next/navigation'
import { requireAdminOrRedirect } from '@/lib/class-schedule/access'
import { fetchClassScheduleDayById } from '@/lib/class-schedule/queries'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminClassScheduleEditPage } from '@/components/class-schedule/AdminClassScheduleEditPage'

export const dynamic = 'force-dynamic'

/** Soft budget for edit/cancel notification fan-out. */
export const maxDuration = 60

export default async function AdminClassScheduleDayPage({
  params,
}: {
  params: Promise<{ dayId: string }>
}) {
  await requireAdminOrRedirect()
  const { dayId } = await params
  const day = await fetchClassScheduleDayById(dayId)
  if (!day) notFound()

  return (
    <AdminPageShell
      title="授業予定の編集"
      backHref="/admin/class-schedule"
      backLabel="授業予定一覧"
    >
      <AdminNarrowContent>
        <AdminClassScheduleEditPage day={day} />
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
