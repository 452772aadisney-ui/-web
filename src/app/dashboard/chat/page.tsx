import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { ChatThreadList } from '@/components/chat/ChatThreadList'
import { fetchStudentChatThread } from '@/lib/chat/thread-list'

export default async function StudentChatListPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect('/admin')

  const thread = await fetchStudentChatThread(profile.id)

  return (
    <StudentPageShell title="メッセージ" backHref="/dashboard" backLabel="ダッシュボード">
      <p className="mb-4 text-sm text-muted">
        トークをタップして管理者とのメッセージを確認・送信できます。
      </p>
      <ChatThreadList
        threads={[thread]}
        hrefForThread={() => '/dashboard/chat/room'}
      />
    </StudentPageShell>
  )
}
