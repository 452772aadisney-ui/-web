import { describe, expect, it } from 'vitest'
import {
  parseMessagePushAllowlist,
  resolveEffectiveMessageMode,
  resolveMessageDeliveryMode,
} from '@/lib/chat/message-delivery-mode'
import {
  MESSAGE_PUSH_BODY,
  MESSAGE_PUSH_PATH,
  MESSAGE_PUSH_TAG,
  MESSAGE_PUSH_TITLE,
  messageIdempotencyKey,
} from '@/lib/chat/message-email'
import {
  classifyMessageDryRunFinal,
  classifyMessagePushReadiness,
} from '@/lib/chat/message-dry-run'

describe('resolveMessageDeliveryMode', () => {
  it('maps unset / empty / invalid to legacy', () => {
    expect(resolveMessageDeliveryMode(undefined)).toBe('legacy')
    expect(resolveMessageDeliveryMode('')).toBe('legacy')
    expect(resolveMessageDeliveryMode('ALL')).toBe('legacy')
  })

  it('accepts exact allowed values', () => {
    expect(resolveMessageDeliveryMode('legacy')).toBe('legacy')
    expect(resolveMessageDeliveryMode('dry-run')).toBe('dry-run')
    expect(resolveMessageDeliveryMode('allowlist')).toBe('allowlist')
    expect(resolveMessageDeliveryMode('all')).toBe('all')
  })
})

describe('parseMessagePushAllowlist / resolveEffectiveMessageMode', () => {
  it('forces legacy on empty/invalid allowlist', () => {
    expect(
      resolveEffectiveMessageMode({
        MESSAGE_DELIVERY_MODE: 'allowlist',
        MESSAGE_PUSH_ALLOWLIST: '',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_empty' })

    expect(parseMessagePushAllowlist('bad')).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('message push copy', () => {
  it('uses fixed lock-screen-safe content and conversation tag without user ids', () => {
    expect(MESSAGE_PUSH_TITLE).toBe('受験生web')
    expect(MESSAGE_PUSH_BODY).toBe('新しいメッセージが届きました。')
    expect(MESSAGE_PUSH_PATH).toBe('/dashboard/chat/room')
    expect(MESSAGE_PUSH_TAG).toBe('chat-message')
    expect(messageIdempotencyKey('m1')).toBe('message:m1')
  })
})

describe('classifyMessageDryRunFinal', () => {
  const base = {
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: true,
    emailLookupOk: true,
    hasEmail: true,
    pushSendingEnabled: true,
  }

  it('respects admin stop', () => {
    expect(
      classifyMessageDryRunFinal({ ...base, preferenceEnabled: false }),
    ).toBe('preference_disabled')
  })

  it('classifies push readiness without sending flag', () => {
    expect(
      classifyMessagePushReadiness({
        preferenceLookupOk: true,
        preferenceEnabled: true,
        subscriptionLookupOk: true,
        hasActivePush: false,
        emailLookupOk: true,
        hasEmail: true,
      }),
    ).toBe('email_fallback')
  })
})
