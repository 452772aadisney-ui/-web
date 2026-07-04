'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
