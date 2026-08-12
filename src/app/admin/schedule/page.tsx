import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminScheduleMenu } from '@/components/schedule/AdminScheduleMenu'

export default async function AdminSchedulePage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  return (
    <AdminPageShell title="スケジュール管理" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">登録種別を選択</h2>
        <p className="mb-6 text-sm text-muted">
          小テスト・課題・申込タスク・模試のいずれかを選んで登録します。
        </p>
        <AdminScheduleMenu />
      </section>
    </AdminPageShell>
  )
}
