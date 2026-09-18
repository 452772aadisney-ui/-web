import type { ChatMessageKind } from '@/types/chat'

/**
 * Human (normal) chat messages count toward unread badges/filters.
 * Everything else is system-generated and must not.
 *
 * Do not classify by body text or "sender is admin".
 * Rule: only `message_kind === 'user'` is human. Missing/null (legacy reads)
 * is treated as human. Any other value (including future automated kinds) is
 * system — so new kinds stay out of normal unread without code changes to
 * the unread queries (which filter `.eq('message_kind', 'user')`).
 */
export const HUMAN_CHAT_MESSAGE_KIND: ChatMessageKind = 'user'

export const SYSTEM_CHAT_MESSAGE_KINDS = ['coaching_booking_reminder'] as const

export type SystemChatMessageKind = (typeof SYSTEM_CHAT_MESSAGE_KINDS)[number]

export function normalizeChatMessageKind(
  kind: string | null | undefined,
): ChatMessageKind {
  if (kind === 'coaching_booking_reminder') return 'coaching_booking_reminder'
  return 'user'
}

export function isHumanChatMessageKind(
  kind: string | null | undefined,
): boolean {
  if (kind == null || kind === '') return true
  return kind === HUMAN_CHAT_MESSAGE_KIND
}

export function isSystemChatMessageKind(
  kind: string | null | undefined,
): boolean {
  return !isHumanChatMessageKind(kind)
}
