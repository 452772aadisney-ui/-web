import { describe, expect, it } from 'vitest'
import {
  isHumanChatMessageKind,
  isSystemChatMessageKind,
  normalizeChatMessageKind,
} from '@/lib/chat/message-kind'

describe('chat message kind classification', () => {
  it('treats only user as human unread-eligible', () => {
    expect(isHumanChatMessageKind('user')).toBe(true)
    expect(isHumanChatMessageKind(undefined)).toBe(true)
    expect(isHumanChatMessageKind(null)).toBe(true)
    expect(isHumanChatMessageKind('coaching_booking_reminder')).toBe(false)
    expect(isSystemChatMessageKind('coaching_booking_reminder')).toBe(true)
  })

  it('normalizes unknown/missing kinds to user for safe reads', () => {
    expect(normalizeChatMessageKind(undefined)).toBe('user')
    expect(normalizeChatMessageKind('nope')).toBe('user')
    expect(normalizeChatMessageKind('coaching_booking_reminder')).toBe(
      'coaching_booking_reminder',
    )
  })

  it('keeps future non-user kinds out of human unread', () => {
    expect(isHumanChatMessageKind('future_auto_notice')).toBe(false)
    expect(isSystemChatMessageKind('future_auto_notice')).toBe(true)
  })
})
