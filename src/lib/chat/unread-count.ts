import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

const EPOCH = '1970-01-01T00:00:00.000Z'

export const fetchUnreadChatCount = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string }>()

  if (!profile) return 0

  const { data: readStates } = await supabase
    .from('chat_read_states')
    .select('student_id, last_read_at')
    .eq('user_id', userId)

  const readMap = new Map(
    (readStates ?? []).map((r) => [r.student_id as string, r.last_read_at as string]),
  )

  if (profile.role === 'student') {
    const since = readMap.get(userId) ?? EPOCH
    const { count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', userId)
      .neq('sender_id', userId)
      .gt('created_at', since)

    return count ?? 0
  }

  const { data: threads } = await supabase
    .from('chat_messages')
    .select('student_id')
    .neq('sender_id', userId)

  const studentIds = [...new Set((threads ?? []).map((row) => row.student_id as string))]
  if (studentIds.length === 0) return 0

  const counts = await Promise.all(
    studentIds.map(async (studentId) => {
      const since = readMap.get(studentId) ?? EPOCH
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .neq('sender_id', userId)
        .gt('created_at', since)
      return count ?? 0
    }),
  )

  return counts.reduce((sum, count) => sum + count, 0)
})
