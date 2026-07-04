import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { ChatThreadList } from '@/components/chat/ChatThreadList'
import { fetchAdminChatThreads } from '@/lib/chat/thread-list'

export default async function AdminChatListPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const threads = await fetchAdminChatThreads(profile.id)

  return (
    <AdminPageShell title="メッセージ" backHref="/admin" backLabel="管理画面">
      <p className="mb-4 text-sm text-muted">
        生徒名をタップしてトークを開けます。未読がある場合は名前の横にバッジが表示されます。
      </p>
      <ChatThreadList
        threads={threads}
        hrefForThread={(studentId) => `/admin/chat/${studentId}`}
        emptyMessage="登録されている生徒がいません。"
      />
    </AdminPageShell>
  )
}
