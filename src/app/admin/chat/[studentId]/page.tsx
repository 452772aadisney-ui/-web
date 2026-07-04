import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { getPersonName } from '@/lib/auth/display-name'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { fetchChatMessages } from '@/lib/chat/queries'
import { fetchStudentProfile } from '@/lib/study/queries'
import type { ChatParticipant } from '@/types/chat'

export default async function AdminChatRoomPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const student = await fetchStudentProfile(studentId)
  if (!student || student.role !== 'student') notFound()

  const messages = await fetchChatMessages(studentId)
  const personName = getPersonName(student)

  const studentParticipant: ChatParticipant = {
    id: student.id,
    display_name: student.display_name,
    full_name: student.full_name,
    role: 'student',
  }

  return (
    <AdminPageShell
      title={personName}
      backHref="/admin/chat"
      backLabel="トーク一覧"
      showMainNav={false}
    >
      <ChatRoom
        studentId={studentId}
        currentUserId={profile.id}
        currentUserRole="admin"
        studentParticipant={studentParticipant}
        initialMessages={messages}
      />
    </AdminPageShell>
  )
}
