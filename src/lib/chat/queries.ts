import { createClient } from '@/lib/supabase/server'
import type { ChatMessage } from '@/types/chat'

export const CHAT_PAGE_SIZE = 30

export async function fetchChatMessages(studentId: string): Promise<ChatMessage[]> {
  const result = await fetchChatMessagesPage(studentId, { limit: 500 })
  return result.messages
}

export async function fetchChatMessagesPage(
  studentId: string,
  options?: { limit?: number; before?: string | null },
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const supabase = await createClient()
  const limit = options?.limit ?? CHAT_PAGE_SIZE

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (options?.before) {
    query = query.lt('created_at', options.before)
  }

  const { data, error } = await query

  if (error || !data) {
    return { messages: [], hasMore: false }
  }

  const hasMore = data.length > limit
  const page = hasMore ? data.slice(0, limit) : data
  const messages = [...(page as ChatMessage[])].reverse()

  return { messages, hasMore }
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
