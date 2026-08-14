'use server'

import { revalidatePath } from 'next/cache'
import { notifyChatMessageReceived } from '@/lib/email/notifications'
import { createClient } from '@/lib/supabase/server'
import type { ChatMessage } from '@/types/chat'
import type { UserRole } from '@/types/database'

export type ChatActionState = {
  error?: string
  message?: ChatMessage
}

export async function sendChatMessage(
  studentId: string,
  body: string,
): Promise<ChatActionState> {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'メッセージを入力してください' }
  if (trimmed.length > 2000) return { error: 'メッセージが長すぎます' }
  if (!studentId) return { error: '送信先が不正です' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, display_name')
    .eq('id', user.id)
    .maybeSingle<{ role: UserRole; full_name: string; display_name: string }>()

  if (profileError || !profile) return { error: 'プロフィールを取得できません' }

  if (profile.role === 'student' && studentId !== user.id) {
    return { error: '送信できません' }
  }

  if (profile.role === 'admin') {
    const { data: student } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', studentId)
      .maybeSingle<{ id: string; role: UserRole }>()

    if (!student || student.role !== 'student') {
      return { error: '送信先の生徒が見つかりません' }
    }
  } else if (profile.role !== 'student') {
    return { error: '送信権限がありません' }
  }

  const { data: message, error: insertError } = await supabase
    .from('chat_messages')
    .insert({
      student_id: studentId,
      sender_id: user.id,
      body: trimmed,
    })
    .select('*')
    .single<ChatMessage>()

  if (insertError || !message) {
    return { error: '送信に失敗しました' }
  }

  try {
    await notifyChatMessageReceived({
      studentId,
      senderId: user.id,
      senderRole: profile.role === 'admin' ? 'admin' : 'student',
      body: trimmed,
    })
  } catch (error) {
    console.error('[chat] email notification failed:', error)
  }

  revalidatePath('/dashboard/chat')
  revalidatePath('/dashboard/chat/room')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/chat/${studentId}`)
  revalidatePath('/dashboard')

  return { message }
}
