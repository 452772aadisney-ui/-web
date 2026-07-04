'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const EPOCH = '1970-01-01T00:00:00.000Z'

function revalidateChatPaths() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/chat')
  revalidatePath('/admin')
  revalidatePath('/admin/chat')
}

export async function markChatAsRead(studentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !studentId) return

  await supabase.from('chat_read_states').upsert(
    {
      user_id: user.id,
      student_id: studentId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,student_id' },
  )

  revalidateChatPaths()
}

export async function fetchUnreadChatCount(userId: string): Promise<number> {
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

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('student_id, created_at')
    .neq('sender_id', userId)

  if (!messages) return 0

  let total = 0
  for (const message of messages) {
    const threadId = message.student_id as string
    const since = readMap.get(threadId) ?? EPOCH
    if ((message.created_at as string) > since) {
      total++
    }
  }

  return total
}
