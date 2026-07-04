import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { fetchChatMessages } from '@/lib/chat/queries'
import type { ChatParticipant } from '@/types/chat'

export default async function StudentChatPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect('/admin')

  const messages = await fetchChatMessages(profile.id)

  const studentParticipant: ChatParticipant = {
    id: profile.id,
    display_name: profile.display_name,
    full_name: profile.full_name,
    role: 'student',
  }

  return (
    <StudentPageShell title="メッセージ" backHref="/dashboard" backLabel="ダッシュボード">
      <p className="mb-4 text-sm text-muted">
        管理者と1対1でメッセージのやり取りができます。リアルタイムで届きます。
      </p>
      <ChatRoom
        studentId={profile.id}
        currentUserId={profile.id}
        currentUserRole="student"
        studentParticipant={studentParticipant}
        initialMessages={messages}
      />
    </StudentPageShell>
  )
}
