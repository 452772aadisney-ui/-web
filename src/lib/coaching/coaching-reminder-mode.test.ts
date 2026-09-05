import { describe, expect, it } from 'vitest'
import {
  addDaysToDateKey,
  formatJstHm,
  getJstTomorrowDateKey,
  getJstWeekDateKeys,
  getJstWeekMondayDateKey,
} from '@/lib/coaching/coaching-reminder-jst'
import {
  bookingPromptIdempotencyKey,
  sessionPreviousDayIdempotencyKey,
  sessionPreviousDayPushBody,
  BOOKING_PROMPT_PUSH_BODY,
} from '@/lib/coaching/coaching-reminder-email'
import {
  parseCoachingReminderPushAllowlist,
  resolveCoachingReminderDeliveryMode,
  resolveEffectiveCoachingReminderMode,
  coachingReminderSoftDeadlineMs,
  COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS,
} from '@/lib/coaching/coaching-reminder-mode'
import {
  classifyCoachingDryRunFinal,
  classifyCoachingPushReadiness,
} from '@/lib/coaching/coaching-reminder-dry-run'

describe('coaching-reminder-jst', () => {
  it('computes JST week Monday and Mon–Sun keys', () => {
    // Sunday 2026-09-06 15:00 JST → week Monday 2026-08-31
    const sunday = new Date('2026-09-06T06:00:00.000Z')
    expect(getJstWeekMondayDateKey(sunday)).toBe('2026-08-31')
    expect(getJstWeekDateKeys('2026-08-31')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ])
  })

  it('treats Monday JST as week start', () => {
    const mondayNoonJst = new Date('2026-09-07T03:00:00.000Z') // Mon 12:00 JST
    expect(getJstWeekMondayDateKey(mondayNoonJst)).toBe('2026-09-07')
  })

  it('tomorrow key is next JST calendar day', () => {
    const evening = new Date('2026-09-06T11:30:00.000Z') // Sep 6 20:30 JST
    expect(getJstTomorrowDateKey(evening)).toBe('2026-09-07')
  })

  it('formats HH:mm in JST including midnight and late evening', () => {
    expect(formatJstHm('2026-09-07T15:00:00.000Z')).toBe('00:00') // JST midnight
    expect(formatJstHm('2026-09-07T14:59:00.000Z')).toBe('23:59')
    expect(sessionPreviousDayPushBody(formatJstHm('2026-09-07T01:30:00.000Z'))).toBe(
      '明日10:30からコーチングです。',
    )
  })

  it('addDaysToDateKey crosses month boundaries', () => {
    expect(addDaysToDateKey('2026-08-31', 7)).toBe('2026-09-07')
  })
})

describe('coaching-reminder idempotency keys', () => {
  it('uses week Monday for booking prompt', () => {
    expect(bookingPromptIdempotencyKey('2026-09-07')).toBe('booking-prompt:2026-09-07')
  })

  it('includes booking id and normalized start for session', () => {
    const start = '2026-09-07T01:30:00.000Z'
    expect(sessionPreviousDayIdempotencyKey('bk-1', start)).toBe(
      `session-previous-day:bk-1:${start}`,
    )
  })

  it('keeps booking prompt push body fixed', () => {
    expect(BOOKING_PROMPT_PUSH_BODY).toBe('今週のコーチングを予約してください。')
  })
})

describe('coaching-reminder-mode', () => {
  const a = '11111111-1111-1111-1111-111111111111'
  const b = '22222222-2222-2222-2222-222222222222'

  it('defaults unset/empty/invalid to legacy', () => {
    expect(resolveCoachingReminderDeliveryMode(undefined)).toBe('legacy')
    expect(resolveCoachingReminderDeliveryMode('')).toBe('legacy')
    expect(resolveCoachingReminderDeliveryMode('ALL')).toBe('legacy')
    expect(resolveCoachingReminderDeliveryMode('dry-run ')).toBe('legacy')
  })

  it('accepts exact modes', () => {
    expect(resolveCoachingReminderDeliveryMode('legacy')).toBe('legacy')
    expect(resolveCoachingReminderDeliveryMode('dry-run')).toBe('dry-run')
    expect(resolveCoachingReminderDeliveryMode('allowlist')).toBe('allowlist')
    expect(resolveCoachingReminderDeliveryMode('all')).toBe('all')
  })

  it('forces legacy when allowlist empty or invalid', () => {
    expect(
      resolveEffectiveCoachingReminderMode({
        COACHING_REMINDER_DELIVERY_MODE: 'allowlist',
        COACHING_REMINDER_PUSH_ALLOWLIST: '',
      }),
    ).toEqual({
      mode: 'legacy',
      allowlist: null,
      forcedLegacyReason: 'allowlist_empty',
    })

    const invalid = resolveEffectiveCoachingReminderMode({
      COACHING_REMINDER_DELIVERY_MODE: 'allowlist',
      COACHING_REMINDER_PUSH_ALLOWLIST: 'not-uuid',
    })
    expect(invalid.mode).toBe('legacy')
    expect(invalid.forcedLegacyReason).toBe('allowlist_invalid')
    expect(JSON.stringify(invalid)).not.toContain('not-uuid')
  })

  it('parses allowlist without logging IDs in failure reasons', () => {
    const ok = parseCoachingReminderPushAllowlist(`${a},${b.toUpperCase()}`)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.ids.has(a)).toBe(true)
      expect(ok.ids.has(b)).toBe(true)
    }
  })

  it('soft deadline reserves 5s under maxDuration 60', () => {
    const started = 1_000_000
    expect(coachingReminderSoftDeadlineMs(started)).toBe(
      started + COACHING_REMINDER_ROUTE_MAX_DURATION_SECONDS * 1000 - 5_000,
    )
  })
})

describe('coaching dry-run classifiers', () => {
  const base = {
    preferenceLookupOk: true,
    preferenceEnabled: true,
    subscriptionLookupOk: true,
    hasActivePush: true,
    emailLookupOk: true,
    hasEmail: true,
  }

  it('classifies preference off', () => {
    expect(
      classifyCoachingDryRunFinal({
        ...base,
        preferenceEnabled: false,
        pushSendingEnabled: true,
      }),
    ).toBe('preference_disabled')
  })

  it('prefers push when sending enabled and subscribed', () => {
    expect(
      classifyCoachingDryRunFinal({ ...base, pushSendingEnabled: true }),
    ).toBe('would_use_push')
  })

  it('falls back to email when push unavailable', () => {
    expect(
      classifyCoachingDryRunFinal({
        ...base,
        hasActivePush: false,
        pushSendingEnabled: true,
      }),
    ).toBe('would_fallback_email')
    expect(
      classifyCoachingDryRunFinal({
        ...base,
        hasActivePush: true,
        pushSendingEnabled: false,
      }),
    ).toBe('would_fallback_email')
  })

  it('marks cannot deliver without email and push', () => {
    expect(
      classifyCoachingDryRunFinal({
        ...base,
        hasActivePush: false,
        hasEmail: false,
        pushSendingEnabled: false,
      }),
    ).toBe('cannot_deliver')
  })

  it('readiness ignores push sending flag', () => {
    expect(classifyCoachingPushReadiness({ ...base, hasActivePush: true })).toBe(
      'push_ready',
    )
    expect(
      classifyCoachingPushReadiness({
        ...base,
        hasActivePush: false,
        hasEmail: true,
      }),
    ).toBe('email_fallback')
  })
})
