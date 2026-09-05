import { describe, expect, it } from 'vitest'
import {
  classifyAnnouncementDryRunFinal,
  classifyAnnouncementPushReadiness,
} from '@/lib/announcements/announcement-dry-run'

describe('classifyAnnouncementDryRunFinal', () => {
  const base = {
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: true,
    emailLookupOk: true,
    hasEmail: true,
    pushSendingEnabled: true,
  }

  it('prefers preference_disabled without creating delivery intent', () => {
    expect(
      classifyAnnouncementDryRunFinal({ ...base, preferenceEnabled: false }),
    ).toBe('preference_disabled')
  })

  it('uses push when enabled and subscribed', () => {
    expect(classifyAnnouncementDryRunFinal(base)).toBe('would_use_push')
  })

  it('falls back to email when push unavailable', () => {
    expect(
      classifyAnnouncementDryRunFinal({
        ...base,
        pushSendingEnabled: false,
        hasActivePush: false,
      }),
    ).toBe('would_fallback_email')
  })

  it('marks cannot_deliver when no push and no email', () => {
    expect(
      classifyAnnouncementDryRunFinal({
        ...base,
        hasActivePush: false,
        hasEmail: false,
        pushSendingEnabled: false,
      }),
    ).toBe('cannot_deliver')
  })

  it('fails closed on preference lookup error', () => {
    expect(
      classifyAnnouncementDryRunFinal({ ...base, preferenceLookupOk: false }),
    ).toBe('failed')
  })
})

describe('classifyAnnouncementPushReadiness', () => {
  it('ignores push sending flag', () => {
    expect(
      classifyAnnouncementPushReadiness({
        preferenceLookupOk: true,
        preferenceEnabled: true,
        subscriptionLookupOk: true,
        hasActivePush: true,
        emailLookupOk: true,
        hasEmail: false,
      }),
    ).toBe('push_ready')
  })
})
