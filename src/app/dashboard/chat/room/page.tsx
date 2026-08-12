import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { fetchChatMessages } from '@/lib/chat/queries'
import type { ChatParticipant } from '@/types/chat'

export default async function StudentChatRoomPage() {
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
    <StudentPageShell
      title="管理者"
      backHref="/dashboard/chat"
      backLabel="トーク一覧"
    >
      <ChatRoom
        studentId={profile.id}
        currentUserId={profile.id}
        currentUserRole="student"
        studentParticipant={studentParticipant}
        initialMessages={messages}
        peerLabel="管理者"
      />
    </StudentPageShell>
  )
}
