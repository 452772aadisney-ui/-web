import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminChatThreadListClient } from '@/components/chat/AdminChatThreadListClient'
import { fetchAdminChatThreads } from '@/lib/chat/thread-list'

export default async function AdminChatListPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const threads = await fetchAdminChatThreads(profile.id)

  return (
    <AdminPageShell title="メッセージ" backHref="/admin" backLabel="管理画面">
      <p className="mb-4 text-sm text-muted">
        生徒名をタップしてトークを開けます。未読がある場合はバッジが表示されます。
        コーチング予約の緊急一括催促は「通知運用」にあります。
      </p>
      <AdminChatThreadListClient threads={threads} />
    </AdminPageShell>
  )
}
