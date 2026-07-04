'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { getPersonName } from '@/lib/auth/display-name'
import { ChatRoom } from '@/components/chat/ChatRoom'
import type { ChatMessage, ChatParticipant } from '@/types/chat'

interface AdminChatPanelProps {
  students: ChatParticipant[]
  currentUserId: string
  selectedStudentId: string | null
  initialMessages: ChatMessage[]
}

export function AdminChatPanel({
  students,
  currentUserId,
  selectedStudentId,
  initialMessages,
}: AdminChatPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null

  const handleSelect = (studentId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('student', studentId)
    router.push(`/admin/chat?${params.toString()}`)
  }

  if (students.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-medium">生徒を選択</span>
        <select
          value={selectedStudentId ?? ''}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {getPersonName(student)}
            </option>
          ))}
        </select>
      </label>

      {selectedStudent && selectedStudentId && (
        <ChatRoom
          key={selectedStudentId}
          studentId={selectedStudentId}
          currentUserId={currentUserId}
          currentUserRole="admin"
          studentParticipant={selectedStudent}
          initialMessages={initialMessages}
        />
      )}
    </div>
  )
}
