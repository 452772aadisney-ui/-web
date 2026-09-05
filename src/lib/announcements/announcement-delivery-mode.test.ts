import { describe, expect, it } from 'vitest'
import {
  parseAnnouncementPushAllowlist,
  resolveAnnouncementDeliveryMode,
  resolveEffectiveAnnouncementMode,
  announcementSoftDeadlineMs,
} from '@/lib/announcements/announcement-delivery-mode'
import {
  announcementIdempotencyKey,
  ANNOUNCEMENT_PUSH_BODY,
  ANNOUNCEMENT_PUSH_PATH,
  ANNOUNCEMENT_PUSH_TITLE,
} from '@/lib/announcements/announcement-email'
import { announcementPublishSuccessMessage } from '@/lib/announcements/announcement-orchestrator'
import type { AnnouncementDeliverySummary } from '@/lib/announcements/announcement-orchestrator'

describe('resolveAnnouncementDeliveryMode', () => {
  it('maps unset / empty / invalid to legacy', () => {
    expect(resolveAnnouncementDeliveryMode(undefined)).toBe('legacy')
    expect(resolveAnnouncementDeliveryMode('')).toBe('legacy')
    expect(resolveAnnouncementDeliveryMode('ALL')).toBe('legacy')
    expect(resolveAnnouncementDeliveryMode(' allowlist')).toBe('legacy')
  })

  it('accepts exact allowed values', () => {
    expect(resolveAnnouncementDeliveryMode('legacy')).toBe('legacy')
    expect(resolveAnnouncementDeliveryMode('dry-run')).toBe('dry-run')
    expect(resolveAnnouncementDeliveryMode('allowlist')).toBe('allowlist')
    expect(resolveAnnouncementDeliveryMode('all')).toBe('all')
  })
})

describe('parseAnnouncementPushAllowlist', () => {
  it('rejects empty and invalid tokens', () => {
    expect(parseAnnouncementPushAllowlist(undefined)).toEqual({ ok: false, reason: 'empty' })
    expect(parseAnnouncementPushAllowlist('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseAnnouncementPushAllowlist('not-a-uuid')).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(
      parseAnnouncementPushAllowlist('11111111-1111-1111-1111-111111111111, bad'),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('parses comma-separated UUIDs without logging contents', () => {
    const parsed = parseAnnouncementPushAllowlist(
      '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.ids.size).toBe(2)
  })
})

describe('resolveEffectiveAnnouncementMode', () => {
  it('forces legacy when allowlist is empty or invalid', () => {
    expect(
      resolveEffectiveAnnouncementMode({
        ANNOUNCEMENT_DELIVERY_MODE: 'allowlist',
        ANNOUNCEMENT_PUSH_ALLOWLIST: '',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_empty' })

    expect(
      resolveEffectiveAnnouncementMode({
        ANNOUNCEMENT_DELIVERY_MODE: 'allowlist',
        ANNOUNCEMENT_PUSH_ALLOWLIST: 'nope',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_invalid' })
  })
})

describe('announcement push copy', () => {
  it('uses fixed lock-screen-safe content', () => {
    expect(ANNOUNCEMENT_PUSH_TITLE).toBe('受験生web')
    expect(ANNOUNCEMENT_PUSH_BODY).toBe('新しいお知らせが届きました。')
    expect(ANNOUNCEMENT_PUSH_PATH).toBe('/dashboard/announcements')
    expect(announcementIdempotencyKey('abc')).toBe('announcement:abc')
  })
})

describe('announcementSoftDeadlineMs', () => {
  it('reserves time before hard duration', () => {
    expect(announcementSoftDeadlineMs(1_000_000, 60, 5_000)).toBe(1_000_000 + 55_000)
  })
})

describe('announcementPublishSuccessMessage', () => {
  function base(partial: Partial<AnnouncementDeliverySummary>): AnnouncementDeliverySummary {
    return {
      ok: true,
      mode: 'all',
      recipients: 2,
      pushSucceeded: 0,
      emailFallbackSucceeded: 0,
      preferenceDisabled: 0,
      cannotDeliver: 0,
      failed: 0,
      legacyEmailRecipientCount: 0,
      legacyEmailSentCount: 0,
      alreadyCompleted: 0,
      inProgress: 0,
      stalePending: 0,
      emailFailed: 0,
      nonProductionSkip: 0,
      durationMs: 1,
      emailUnprocessedCount: 0,
      timedOut: false,
      ...partial,
    }
  }

  it('reports full success', () => {
    expect(
      announcementPublishSuccessMessage(
        base({ pushSucceeded: 1, emailFallbackSucceeded: 1 }),
      ),
    ).toBe('お知らせを公開しました')
  })

  it('reports partial failure', () => {
    expect(
      announcementPublishSuccessMessage(base({ pushSucceeded: 1, failed: 1 })),
    ).toBe('お知らせは公開しましたが、一部の通知を送信できませんでした')
  })

  it('reports total notification failure while announcement stays published', () => {
    expect(announcementPublishSuccessMessage(base({ failed: 2 }))).toBe(
      'お知らせは公開しましたが、通知を送信できませんでした',
    )
  })
})
