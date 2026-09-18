'use server'

import { revalidatePath } from 'next/cache'
import {
  listUnreadStudyFeedbackIds,
  markStudyFeedbackAsRead,
  markStudyFeedbackIdsAsRead,
} from '@/lib/study/feedback-queries'
import { createClient } from '@/lib/supabase/server'

function revalidateStudyFeedbackPaths() {
  revalidatePath('/dashboard/study/history')
  revalidatePath('/dashboard/study/history/comments')
  revalidatePath('/dashboard')
}

export type MarkStudyFeedbackReadResult =
  | { ok: true }
  | { ok: false; error: string }

export async function markStudyFeedbackRead(
  feedbackId: string,
): Promise<MarkStudyFeedbackReadResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'ログインが必要です' }

  const result = await markStudyFeedbackAsRead(feedbackId, user.id)
  if (!result.ok) {
    if (result.reason === 'forbidden' || result.reason === 'not_found') {
      return { ok: false, error: '対象のコメントが見つかりません' }
    }
    return { ok: false, error: '既読にできませんでした' }
  }

  revalidateStudyFeedbackPaths()
  return { ok: true }
}

/**
 * Mark all comments that are unread at the start of this call.
 * Newly arrived comments during processing are not included.
 */
export async function markAllUnreadStudyFeedbackRead(): Promise<
  MarkStudyFeedbackReadResult & { marked?: number }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'ログインが必要です' }

  const snapshotIds = await listUnreadStudyFeedbackIds(user.id)
  if (snapshotIds.length === 0) {
    revalidateStudyFeedbackPaths()
    return { ok: true, marked: 0 }
  }

  const { marked, failed } = await markStudyFeedbackIdsAsRead(snapshotIds, user.id)
  revalidateStudyFeedbackPaths()

  if (failed > 0 && marked === 0) {
    return { ok: false, error: '既読にできませんでした' }
  }
  return { ok: true, marked }
}
