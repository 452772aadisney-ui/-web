'use client'

import { getPersonName } from '@/lib/auth/display-name'

import { useEffect, useMemo, useRef, useState } from 'react'
import { sendChatMessage } from '@/app/chat/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import type { UnlockedAchievement } from '@/lib/achievements/unlock'
import { markChatAsRead } from '@/lib/chat/unread'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ChatMessage, ChatParticipant } from '@/types/chat'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ChatRoomProps {
  studentId: string
  currentUserId: string
  currentUserRole: 'student' | 'admin'
  studentParticipant: ChatParticipant
  initialMessages: ChatMessage[]
  peerLabel?: string
}

export function ChatRoom({
  studentId,
  currentUserId,
  currentUserRole,
  studentParticipant,
  initialMessages,
  peerLabel,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUnlockedAchievements, setLastUnlockedAchievements] = useState<
    UnlockedAchievement[] | undefined
  >(undefined)
  const { dialog: achievementDialog } = useAchievementUnlockDialog(lastUnlockedAchievements)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages, studentId])

  useEffect(() => {
    void markChatAsRead(studentId)
  }, [studentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [studentId, supabase])

  const getSenderLabel = (senderId: string): string => {
    if (senderId === currentUserId) return '自分'
    if (senderId === studentParticipant.id) {
      return getPersonName(studentParticipant)
    }
    return '管理者'
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setSending(true)
    setError(null)

    const result = await sendChatMessage(studentId, trimmed)

    setSending(false)

    if (result.error || !result.message) {
      setError(result.error ?? '送信に失敗しました')
      return
    }

    setBody('')
    setMessages((prev) => {
      if (prev.some((m) => m.id === result.message!.id)) return prev
      return [...prev, result.message!]
    })

    if (result.unlockedAchievements?.length) {
      setLastUnlockedAchievements(result.unlockedAchievements)
    }
  }

  const peerDisplayName =
    peerLabel ??
    (currentUserRole === 'admin' ? getPersonName(studentParticipant) : '管理者')

  return (
    <>
      {achievementDialog}
      <div className="flex h-[min(70vh,560px)] flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm text-muted">
          {currentUserRole === 'admin' ? 'チャット相手' : '管理者とのチャット'}
        </p>
        <p className="font-bold">{peerDisplayName}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted">
            まだメッセージはありません。最初のメッセージを送ってみましょう。
          </p>
        ) : (
          messages.map((message) => {
            const isMine = message.sender_id === currentUserId
            return (
              <div
                key={message.id}
                className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                    isMine
                      ? 'rounded-br-md bg-primary text-white'
                      : 'rounded-bl-md border border-border bg-background',
                  )}
                >
                  <p className="mb-1 text-xs opacity-80">{getSenderLabel(message.sender_id)}</p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className={cn('mt-1 text-[10px]', isMine ? 'text-white/70' : 'text-muted')}>
                    {formatTime(message.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="メッセージを入力…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            maxLength={2000}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? '送信中…' : '送信'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </form>
    </div>
    </>
  )
}
