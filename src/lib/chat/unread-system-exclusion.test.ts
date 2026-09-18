import { describe, expect, it } from 'vitest'
import {
  isHumanChatMessageKind,
  isSystemChatMessageKind,
} from '@/lib/chat/message-kind'

describe('normal unread eligibility vs system messages', () => {
  it('counts only human messages toward unread; system stays in history', () => {
    const thread = [
      { id: '1', kind: 'user', body: 'hello' },
      { id: '2', kind: 'coaching_booking_reminder', body: '催促' },
      { id: '3', kind: 'user', body: 'thanks' },
    ]

    const unreadEligible = thread.filter((m) => isHumanChatMessageKind(m.kind))
    expect(unreadEligible.map((m) => m.id)).toEqual(['1', '3'])

    // System rows remain present for history rendering.
    expect(thread.some((m) => isSystemChatMessageKind(m.kind))).toBe(true)
  })

  it('does not clear prior human unread when a later system message arrives', () => {
    const lastReadAt = '2026-09-01T00:00:00.000Z'
    const messages = [
      { created_at: '2026-09-02T00:00:00.000Z', kind: 'user' },
      { created_at: '2026-09-03T00:00:00.000Z', kind: 'coaching_booking_reminder' },
    ]
    const unreadHuman = messages.filter(
      (m) =>
        isHumanChatMessageKind(m.kind) &&
        m.created_at > lastReadAt,
    )
    expect(unreadHuman).toHaveLength(1)
    // Watermark is unchanged by system insert (no auto mark-read on insert).
    expect(lastReadAt < messages[1]!.created_at).toBe(true)
  })
})
