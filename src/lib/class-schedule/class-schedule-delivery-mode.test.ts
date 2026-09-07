import { describe, expect, it } from 'vitest'
import {
  parseClassSchedulePushAllowlist,
  resolveClassScheduleDeliveryMode,
  resolveEffectiveClassScheduleMode,
  classScheduleSoftDeadlineMs,
} from '@/lib/class-schedule/class-schedule-delivery-mode'
import {
  CLASS_SCHEDULE_PUSH_BODY_BY_KIND,
  CLASS_SCHEDULE_PUSH_PATH,
  CLASS_SCHEDULE_PUSH_TITLE,
  classScheduleIdempotencyKey,
} from '@/lib/class-schedule/class-schedule-email'
import {
  classScheduleDayFieldsChanged,
  classScheduleSessionFieldsChanged,
} from '@/lib/class-schedule/notify-change'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'

describe('resolveClassScheduleDeliveryMode', () => {
  it('maps unset / empty / invalid to legacy', () => {
    expect(resolveClassScheduleDeliveryMode(undefined)).toBe('legacy')
    expect(resolveClassScheduleDeliveryMode('')).toBe('legacy')
    expect(resolveClassScheduleDeliveryMode('ALL')).toBe('legacy')
    expect(resolveClassScheduleDeliveryMode(' allowlist')).toBe('legacy')
  })

  it('accepts exact allowed values', () => {
    expect(resolveClassScheduleDeliveryMode('legacy')).toBe('legacy')
    expect(resolveClassScheduleDeliveryMode('dry-run')).toBe('dry-run')
    expect(resolveClassScheduleDeliveryMode('allowlist')).toBe('allowlist')
    expect(resolveClassScheduleDeliveryMode('all')).toBe('all')
  })

  it('documents legacy as the safe no-send default (no prior email path)', () => {
    // Orchestrator skips Push/email entirely when mode is legacy.
    expect(resolveClassScheduleDeliveryMode(undefined)).toBe('legacy')
    expect(
      resolveEffectiveClassScheduleMode({ CLASS_SCHEDULE_DELIVERY_MODE: 'legacy' }).mode,
    ).toBe('legacy')
  })
})

describe('parseClassSchedulePushAllowlist', () => {
  it('rejects empty and invalid tokens', () => {
    expect(parseClassSchedulePushAllowlist(undefined)).toEqual({ ok: false, reason: 'empty' })
    expect(parseClassSchedulePushAllowlist('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseClassSchedulePushAllowlist('not-a-uuid')).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('parses comma-separated UUIDs', () => {
    const parsed = parseClassSchedulePushAllowlist(
      '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.ids.size).toBe(2)
  })
})

describe('resolveEffectiveClassScheduleMode', () => {
  it('forces legacy when allowlist is empty or invalid', () => {
    expect(
      resolveEffectiveClassScheduleMode({
        CLASS_SCHEDULE_DELIVERY_MODE: 'allowlist',
        CLASS_SCHEDULE_PUSH_ALLOWLIST: '',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_empty' })

    expect(
      resolveEffectiveClassScheduleMode({
        CLASS_SCHEDULE_DELIVERY_MODE: 'allowlist',
        CLASS_SCHEDULE_PUSH_ALLOWLIST: 'nope',
      }),
    ).toMatchObject({ mode: 'legacy', forcedLegacyReason: 'allowlist_invalid' })
  })
})

describe('class schedule push copy and idempotency', () => {
  it('uses fixed brand title and lock-screen-safe bodies', () => {
    expect(CLASS_SCHEDULE_PUSH_TITLE).toBe('受験生web')
    expect(CLASS_SCHEDULE_PUSH_PATH).toBe('/dashboard/class-schedule')
    expect(CLASS_SCHEDULE_PUSH_BODY_BY_KIND.create).toBe(
      '新しい授業予定が登録されました。',
    )
    expect(CLASS_SCHEDULE_PUSH_BODY_BY_KIND.change).toBe(
      '授業予定が変更されました。内容を確認してください。',
    )
    expect(CLASS_SCHEDULE_PUSH_BODY_BY_KIND.cancel).toBe(
      '授業予定が中止になりました。内容を確認してください。',
    )
  })

  it('formats idempotency keys without PII', () => {
    const key = classScheduleIdempotencyKey({
      dayId: 'day-uuid',
      notifyRevision: 3,
      kind: 'change',
    })
    expect(key).toBe('class_schedule:day-uuid:r3:change')
    expect(key).not.toMatch(/会場|住所|数学|@/)
  })

  it('defaults class_schedule preference ON', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.class_schedule).toBe(true)
  })
})

describe('classScheduleSoftDeadlineMs', () => {
  it('reserves time before hard duration', () => {
    expect(classScheduleSoftDeadlineMs(1_000_000, 60, 5_000)).toBe(1_000_000 + 55_000)
  })
})

describe('notify-change helpers', () => {
  it('detects day field changes', () => {
    const base = {
      schedule_date: '2026-09-10',
      venue_name: '本校',
      address: null,
      map_url: null,
      room_note: null,
    }
    expect(classScheduleDayFieldsChanged(base, base)).toBe(false)
    expect(
      classScheduleDayFieldsChanged(base, { ...base, venue_name: '別会場' }),
    ).toBe(true)
  })

  it('detects session field changes including note', () => {
    const base = {
      start_time: '10:00:00',
      end_time: '11:00:00',
      subject: '数学',
      note: null,
    }
    expect(classScheduleSessionFieldsChanged(base, base)).toBe(false)
    expect(
      classScheduleSessionFieldsChanged(base, {
        ...base,
        start_time: '10:00',
        end_time: '11:00',
      }),
    ).toBe(false)
    expect(
      classScheduleSessionFieldsChanged(base, { ...base, note: '持参物あり' }),
    ).toBe(true)
  })
})
