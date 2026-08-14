'use server'

import { revalidatePath } from 'next/cache'
import { markStudyFeedbackAsRead } from '@/lib/study/feedback-queries'
import { createClient } from '@/lib/supabase/server'

export async function markStudyFeedbackRead(feedbackId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await markStudyFeedbackAsRead(feedbackId, user.id)
  revalidatePath('/dashboard/study/history')
  revalidatePath('/dashboard')
}
