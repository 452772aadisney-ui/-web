'use server'

import { revalidatePath } from 'next/cache'
import { evaluateAndUnlockAchievements, type UnlockedAchievement } from '@/lib/achievements/unlock'
import { notifyStudentChatMessage } from '@/lib/discord/notifications'
import { notifyChatMessageReceived } from '@/lib/email/notifications'
import { deliverStudentMessageNotification } from '@/lib/chat/message-orchestrator'
import {
  HUMAN_CHAT_MESSAGE_KIND,
  isHumanChatMessageKind,
  normalizeChatMessageKind,
} from '@/lib/chat/message-kind'
import { createClient } from '@/lib/supabase/server'
import {
  ADMIN_STUDENT_NOT_FOUND,
  assertAdminCanAccessStudent,
  requireAdminAccess,
} from '@/lib/auth/admin-access'
import { fetchStudentsWithoutCoachingBookingThisWeek } from '@/lib/coaching/queries'
import { fetchChatMessagesPage } from '@/lib/chat/queries'
import type { ChatMessage, ChatMessageKind } from '@/types/chat'
import type { UserRole } from '@/types/database'

export type ChatActionState = {
  error?: string
  message?: ChatMessage
  unlockedAchievements?: UnlockedAchievement[]
}

export type ChatBulkReminderState = {
  error?: string
  success?: boolean
  sentCount?: number
  failedCount?: number
}

const DEFAULT_COACHING_BOOKING_REMINDER =
  '今週のコーチング予約が入っていません。マイページの「コーチング予約」から，早急に予約してください。今週が難しい場合は，必ず担当者に個別で相談してください。'

export type SendChatMessageOptions = {
  /**
   * Defaults to 'user'. Only admins may set system kinds such as
   * coaching_booking_reminder. Students are forced to user (app + DB trigger).
   */
  messageKind?: ChatMessageKind
}

export async function sendChatMessage(
  studentId: string,
  body: string,
  options?: SendChatMessageOptions,
): Promise<ChatActionState> {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'メッセージを入力してください' }
  if (trimmed.length > 2000) return { error: 'メッセージが長すぎます' }
  if (!studentId) return { error: '送信先が不正です' }

  const requestedKind = normalizeChatMessageKind(options?.messageKind)
  // Reject unknown kinds early (normalize maps unknowns to user; only allow
  // explicitly requested system kinds that we understand).
  if (
    options?.messageKind != null &&
    options.messageKind !== 'user' &&
    options.messageKind !== 'coaching_booking_reminder'
  ) {
    return { error: '送信に失敗しました' }
  }

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
    const access = await requireAdminAccess()
    if (!access.ok) return { error: access.error }

    const canAccess = await assertAdminCanAccessStudent(studentId, access)
    if (!canAccess.ok) return { error: ADMIN_STUDENT_NOT_FOUND }
  } else if (profile.role !== 'student') {
    return { error: '送信権限がありません' }
  }

  // Students cannot create system kinds (DB trigger also forces user).
  const messageKind: ChatMessageKind =
    profile.role === 'admin' ? requestedKind : HUMAN_CHAT_MESSAGE_KIND

  const { data: message, error: insertError } = await supabase
    .from('chat_messages')
    .insert({
      student_id: studentId,
      sender_id: user.id,
      body: trimmed,
      message_kind: messageKind,
    })
    .select('*')
    .single<ChatMessage>()

  if (insertError || !message) {
    return { error: '送信に失敗しました' }
  }

  const senderRole = profile.role === 'admin' ? 'admin' : 'student'

  try {
    if (senderRole === 'admin') {
      // Student-facing: mode-aware Push-first (skips non-user kinds).
      const summary = await deliverStudentMessageNotification({
        messageId: message.id,
        studentId,
        senderId: user.id,
        senderRole: 'admin',
        messageKind: message.message_kind ?? messageKind,
        body: trimmed,
      })
      console.info('[chat] student notification summary:', {
        mode: summary.mode,
        skippedReason: summary.skippedReason,
        pushSucceeded: summary.pushSucceeded,
        emailFallbackSucceeded: summary.emailFallbackSucceeded,
        preferenceDisabled: summary.preferenceDisabled,
        cannotDeliver: summary.cannotDeliver,
        failed: summary.failed,
        legacyEmailSent: summary.legacyEmailSent,
        humanKind: isHumanChatMessageKind(message.message_kind ?? messageKind),
      })
    } else {
      // Student → admins: unchanged email + Discord (not under MESSAGE_DELIVERY_MODE).
      await notifyChatMessageReceived({
        studentId,
        senderId: user.id,
        senderRole: 'student',
        body: trimmed,
      })
      await notifyStudentChatMessage({ studentId, body: trimmed })
    }
  } catch {
    console.error('[chat] notification failed after save')
  }

  revalidatePath('/dashboard/chat')
  revalidatePath('/dashboard/chat/room')
  revalidatePath('/admin/chat')
  revalidatePath(`/admin/chat/${studentId}`)
  revalidatePath('/dashboard')

  const unlockedAchievements =
    profile.role === 'student' ? await evaluateAndUnlockAchievements(user.id) : []

  return { message, unlockedAchievements }
}

export async function loadOlderChatMessages(
  studentId: string,
  before: string,
): Promise<{ messages?: ChatMessage[]; hasMore?: boolean; error?: string }> {
  if (!studentId || !before) return { error: '不正なリクエストです' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: UserRole }>()

  if (!profile) return { error: 'プロフィールを取得できません' }
  if (profile.role === 'student' && studentId !== user.id) {
    return { error: '閲覧できません' }
  }
  if (profile.role !== 'student' && profile.role !== 'admin') {
    return { error: '閲覧権限がありません' }
  }

  const result = await fetchChatMessagesPage(studentId, { before })
  return result
}

export async function sendCoachingBookingReminders(
  _prev: ChatBulkReminderState,
  formData: FormData,
): Promise<ChatBulkReminderState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: UserRole }>()

  if (profile?.role !== 'admin') return { error: '管理者権限が必要です' }

  const body = String(formData.get('body') ?? '').trim() || DEFAULT_COACHING_BOOKING_REMINDER
  if (body.length > 2000) return { error: 'メッセージが長すぎます' }

  const students = await fetchStudentsWithoutCoachingBookingThisWeek()
  if (students.length === 0) return { error: '今週未予約の生徒がいません' }

  let sentCount = 0
  let failedCount = 0

  for (const student of students) {
    const result = await sendChatMessage(student.id, body, {
      messageKind: 'coaching_booking_reminder',
    })
    if (result.error) failedCount += 1
    else sentCount += 1
  }

  revalidatePath('/admin/chat')
  revalidatePath('/admin/coaching')
  revalidatePath('/admin/notifications')

  if (sentCount === 0) {
    return { error: 'メッセージの送信に失敗しました', failedCount }
  }

  return {
    success: true,
    sentCount,
    failedCount,
  }
}
