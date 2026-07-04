import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminChatPanel } from '@/components/chat/AdminChatPanel'
import { fetchChatMessages } from '@/lib/chat/queries'
import { fetchStudentList } from '@/lib/study/queries'
import type { ChatParticipant } from '@/types/chat'

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const { student: studentParam } = await searchParams
  const studentsRaw = await fetchStudentList()

  const students: ChatParticipant[] = studentsRaw.map((s) => ({
    id: s.id,
    display_name: s.display_name,
    full_name: s.full_name,
    role: 'student' as const,
  }))

  const selectedStudentId =
    studentParam && students.some((s) => s.id === studentParam)
      ? studentParam
      : (students[0]?.id ?? null)

  const initialMessages = selectedStudentId
    ? await fetchChatMessages(selectedStudentId)
    : []

  return (
    <AdminPageShell title="メッセージ" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        生徒を選んで1対1のチャットができます。Supabase Realtime でリアルタイムに反映されます。
      </p>
      <Suspense fallback={<p className="text-sm text-muted">読み込み中…</p>}>
        <AdminChatPanel
          students={students}
          currentUserId={profile.id}
          selectedStudentId={selectedStudentId}
          initialMessages={initialMessages}
        />
      </Suspense>
    </AdminPageShell>
  )
}
