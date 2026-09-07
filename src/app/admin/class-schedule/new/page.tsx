import { requireAdminOrRedirect } from '@/lib/class-schedule/access'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminClassScheduleCreateForm } from '@/components/class-schedule/AdminClassScheduleCreateForm'

export const dynamic = 'force-dynamic'

/** Soft budget for create notification fan-out. */
export const maxDuration = 60

export default async function AdminClassScheduleNewPage() {
  await requireAdminOrRedirect()

  return (
    <AdminPageShell
      title="授業予定の新規登録"
      backHref="/admin/class-schedule"
      backLabel="授業予定一覧"
    >
      <AdminNarrowContent>
        <p className="mb-6 text-sm text-muted">
          日付・会場と、1日分のコマ（開始・終了・科目）を登録します。日をまたぐ時間帯は登録できません。
        </p>
        <AdminClassScheduleCreateForm />
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
