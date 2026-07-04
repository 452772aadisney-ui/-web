import { createClient } from '@/lib/supabase/server'
import type { ChatMessage } from '@/types/chat'

export async function fetchChatMessages(studentId: string): Promise<ChatMessage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (error || !data) {
    return []
  }

  return data as ChatMessage[]
}

export async function fetchLatestChatMessageByStudent(
  studentId: string,
): Promise<ChatMessage | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as ChatMessage) ?? null
}
