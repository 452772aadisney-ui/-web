import { describe, expect, it } from 'vitest'
import {
  parseStudyReminderPushAllowlist,
  resolveEffectiveStudyReminderMode,
  resolveStudyReminderDeliveryMode,
  isVercelNonProduction,
  STUDY_REMINDER_PENDING_STALE_MS,
} from '@/lib/study/study-reminder-mode'
import { classifyExistingDeliveries } from '@/lib/study/study-reminder-new-path'

describe('resolveStudyReminderDeliveryMode', () => {
  it('defaults unset/empty/invalid to legacy', () => {
    expect(resolveStudyReminderDeliveryMode(undefined)).toBe('legacy')
    expect(resolveStudyReminderDeliveryMode('')).toBe('legacy')
    expect(resolveStudyReminderDeliveryMode('ALL')).toBe('legacy')
    expect(resolveStudyReminderDeliveryMode(' legacy')).toBe('legacy')
    expect(resolveStudyReminderDeliveryMode('dry-run ')).toBe('legacy')
  })

  it('accepts exact allowed values only', () => {
    expect(resolveStudyReminderDeliveryMode('legacy')).toBe('legacy')
    expect(resolveStudyReminderDeliveryMode('dry-run')).toBe('dry-run')
    expect(resolveStudyReminderDeliveryMode('allowlist')).toBe('allowlist')
    expect(resolveStudyReminderDeliveryMode('all')).toBe('all')
  })
})

describe('parseStudyReminderPushAllowlist', () => {
  const a = '11111111-1111-1111-1111-111111111111'
  const b = '22222222-2222-2222-2222-222222222222'

  it('rejects empty', () => {
    expect(parseStudyReminderPushAllowlist(undefined)).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(parseStudyReminderPushAllowlist('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseStudyReminderPushAllowlist(',,,')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects any invalid token and does not expose values in result', () => {
    const result = parseStudyReminderPushAllowlist(`${a},not-a-uuid`)
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(JSON.stringify(result)).not.toContain(a)
  })

  it('dedupes valid UUIDs case-insensitively', () => {
    const result = parseStudyReminderPushAllowlist(`${a},${a.toUpperCase()},${b}`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ids.size).toBe(2)
      expect(result.ids.has(a)).toBe(true)
      expect(result.ids.has(b)).toBe(true)
    }
  })
})

describe('resolveEffectiveStudyReminderMode', () => {
  it('forces legacy when allowlist is empty or invalid', () => {
    expect(
      resolveEffectiveStudyReminderMode({
        STUDY_REMINDER_DELIVERY_MODE: 'allowlist',
        STUDY_REMINDER_PUSH_ALLOWLIST: '',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_empty' })

    expect(
      resolveEffectiveStudyReminderMode({
        STUDY_REMINDER_DELIVERY_MODE: 'allowlist',
        STUDY_REMINDER_PUSH_ALLOWLIST: 'bad',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_invalid' })
  })

  it('keeps allowlist when UUIDs are valid', () => {
    const id = '33333333-3333-3333-3333-333333333333'
    const result = resolveEffectiveStudyReminderMode({
      STUDY_REMINDER_DELIVERY_MODE: 'allowlist',
      STUDY_REMINDER_PUSH_ALLOWLIST: id,
    })
    expect(result.mode).toBe('allowlist')
    expect(result.allowlist?.has(id)).toBe(true)
  })
})

describe('isVercelNonProduction', () => {
  it('is true only when VERCEL_ENV is set and not production', () => {
    expect(isVercelNonProduction({})).toBe(false)
    expect(isVercelNonProduction({ VERCEL_ENV: 'production' })).toBe(false)
    expect(isVercelNonProduction({ VERCEL_ENV: 'preview' })).toBe(true)
  })
})

describe('classifyExistingDeliveries', () => {
  const now = Date.parse('2026-09-05T13:00:00.000Z')

  it('treats push or email sent as completed', () => {
    expect(
      classifyExistingDeliveries(
        [
          {
            id: '1',
            channel: 'push',
            status: 'sent',
            sent_at: '2026-09-05T12:00:00.000Z',
            created_at: '2026-09-05T12:00:00.000Z',
          },
        ],
        now,
      ).gate,
    ).toBe('already_completed')
  })

  it('skips fresh pending without resend', () => {
    expect(
      classifyExistingDeliveries(
        [
          {
            id: '1',
            channel: 'push',
            status: 'pending',
            sent_at: new Date(now - 60_000).toISOString(),
            created_at: new Date(now - 60_000).toISOString(),
          },
        ],
        now,
      ).gate,
    ).toBe('in_progress')
  })

  it('marks stale pending after 10 minutes', () => {
    const classified = classifyExistingDeliveries(
      [
        {
          id: 'stale-1',
          channel: 'email',
          status: 'pending',
          sent_at: new Date(now - STUDY_REMINDER_PENDING_STALE_MS - 1).toISOString(),
          created_at: new Date(now - STUDY_REMINDER_PENDING_STALE_MS - 1).toISOString(),
        },
      ],
      now,
    )
    expect(classified.gate).toBe('stale_pending')
    expect(classified.stalePendingIds).toEqual(['stale-1'])
  })

  it('does not retry failed email', () => {
    expect(
      classifyExistingDeliveries(
        [
          {
            id: '1',
            channel: 'email',
            status: 'failed',
            sent_at: '2026-09-05T12:00:00.000Z',
            created_at: '2026-09-05T12:00:00.000Z',
          },
        ],
        now,
      ).gate,
    ).toBe('email_terminal')
  })
})
