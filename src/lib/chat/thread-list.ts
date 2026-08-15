import { cache } from 'react'
import { adminUnreadCutoff, unreadSinceTimestamp } from '@/lib/account/content-cutoff'
import { createClient } from '@/lib/supabase/server'
import { fetchStudentList } from '@/lib/study/queries'
import type { ChatMessage } from '@/types/chat'

const EPOCH = '1970-01-01T00:00:00.000Z'

export interface ChatThreadSummary {
  studentId: string
  full_name: string
  display_name: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

async function fetchReadMap(userId: string): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('chat_read_states')
    .select('student_id, last_read_at')
    .eq('user_id', userId)

  return new Map(
    (data ?? []).map((row) => [row.student_id as string, row.last_read_at as string]),
  )
}

async function countUnreadForThread(
  viewerId: string,
  studentId: string,
  readMap: Map<string, string>,
  accountCreatedAt?: string,
): Promise<number> {
  const supabase = await createClient()
  const since = accountCreatedAt
    ? unreadSinceTimestamp(readMap.get(studentId), accountCreatedAt)
    : readMap.get(studentId) ?? EPOCH
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .neq('sender_id', viewerId)
    .gt('created_at', since)

  return count ?? 0
}

function buildLatestMessageMap(messages: ChatMessage[]): Map<string, ChatMessage> {
  const map = new Map<string, ChatMessage>()
  for (const message of messages) {
    if (!map.has(message.student_id)) {
      map.set(message.student_id, message)
    }
  }
  return map
}

export const fetchAdminChatThreads = cache(async (adminUserId: string): Promise<ChatThreadSummary[]> => {
  const students = await fetchStudentList()
  if (students.length === 0) return []

  const studentIds = students.map((s) => s.id)
  const supabase = await createClient()

  const [{ data: messages }, readMap, { data: adminProfile }] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('*')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false }),
    fetchReadMap(adminUserId),
    supabase
      .from('profiles')
      .select('created_at, admin_since')
      .eq('id', adminUserId)
      .maybeSingle<{ created_at: string; admin_since: string | null }>(),
  ])

  const adminCutoff = adminProfile
    ? adminUnreadCutoff(adminProfile.admin_since, adminProfile.created_at)
    : undefined
  const latestByStudent = buildLatestMessageMap((messages as ChatMessage[]) ?? [])

  const threads = await Promise.all(
    students.map(async (student) => {
      const latest = latestByStudent.get(student.id)
      const unreadCount = await countUnreadForThread(
        adminUserId,
        student.id,
        readMap,
        adminCutoff,
      )
      return {
        studentId: student.id,
        full_name: student.full_name,
        display_name: student.display_name,
        lastMessage: latest?.body ?? null,
        lastMessageAt: latest?.created_at ?? null,
        unreadCount,
      }
    }),
  )

  return threads.sort((a, b) => {
    const aTime = a.lastMessageAt ?? ''
    const bTime = b.lastMessageAt ?? ''
    if (aTime && bTime) return bTime.localeCompare(aTime)
    if (aTime) return -1
    if (bTime) return 1
    return a.full_name.localeCompare(b.full_name, 'ja')
  })
})

export const fetchStudentChatThread = cache(
  async (studentId: string): Promise<ChatThreadSummary> => {
    const supabase = await createClient()
    const [{ data: profile }, readMap] = await Promise.all([
      supabase
        .from('profiles')
        .select('created_at')
        .eq('id', studentId)
        .maybeSingle<{ created_at: string }>(),
      fetchReadMap(studentId),
    ])

    const { data: latest } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ChatMessage>()

    const unreadCount = await countUnreadForThread(
      studentId,
      studentId,
      readMap,
      profile?.created_at,
    )

    return {
      studentId,
      full_name: '管理者',
      display_name: '管理者',
      lastMessage: latest?.body ?? null,
      lastMessageAt: latest?.created_at ?? null,
      unreadCount,
    }
  },
)
