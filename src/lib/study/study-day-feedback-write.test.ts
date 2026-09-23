import { describe, expect, it, vi } from 'vitest'
import {
  STUDY_FEEDBACK_CONFLICT_MESSAGE,
  STUDY_FEEDBACK_VERSION_REQUIRED_MESSAGE,
  didStudyFeedbackCommentChange,
  interpretConditionalUpdateResult,
  interpretInsertResult,
  resolveStudyDayFeedbackWriteIntent,
  shouldRunStudyFeedbackSideEffects,
} from '@/lib/study/study-day-feedback-write'

const sampleRow = {
  id: 'fb-1',
  student_id: 'student-1',
  studied_on: '2026-09-21',
  stamp: 'good' as const,
  comment: 'hello',
  admin_id: 'admin-1',
  created_at: '2026-09-21T01:00:00.123456+00:00',
  updated_at: '2026-09-21T01:00:00.123456+00:00',
}

describe('resolveStudyDayFeedbackWriteIntent', () => {
  it('uses INSERT when expected feedback id is absent', () => {
    expect(
      resolveStudyDayFeedbackWriteIntent({
        expectedFeedbackId: '',
        expectedUpdatedAt: '',
      }),
    ).toEqual({ type: 'insert' })
  })

  it('refuses UPDATE when id is present but expectedUpdatedAt is missing', () => {
    expect(
      resolveStudyDayFeedbackWriteIntent({
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt: '',
      }),
    ).toEqual({
      error: STUDY_FEEDBACK_VERSION_REQUIRED_MESSAGE,
      conflict: true,
    })
  })

  it('builds conditional UPDATE intent with exact updated_at string', () => {
    const updatedAt = '2026-09-21T01:00:00.123456+00:00'
    expect(
      resolveStudyDayFeedbackWriteIntent({
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt: updatedAt,
      }),
    ).toEqual({
      type: 'update',
      id: 'fb-1',
      expectedUpdatedAt: updatedAt,
    })
  })
})

describe('interpretInsertResult', () => {
  it('maps unique violation to conflict without success', () => {
    const outcome = interpretInsertResult({
      error: { code: '23505' },
      row: null,
    })
    expect(outcome).toEqual({
      ok: false,
      conflict: true,
      error: STUDY_FEEDBACK_CONFLICT_MESSAGE,
    })
    expect(shouldRunStudyFeedbackSideEffects(outcome)).toBe(false)
  })

  it('returns inserted row on success', () => {
    const outcome = interpretInsertResult({ error: null, row: sampleRow })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.wasInsert).toBe(true)
    expect(outcome.previousComment).toBe('')
    expect(outcome.feedback.updated_at).toBe(sampleRow.updated_at)
    expect(shouldRunStudyFeedbackSideEffects(outcome)).toBe(true)
  })
})

describe('interpretConditionalUpdateResult', () => {
  it('treats zero updated rows as conflict (stale version / stamp-only race)', () => {
    const outcome = interpretConditionalUpdateResult({
      error: null,
      updatedRow: null,
      previousComment: '旧コメント',
    })
    expect(outcome).toEqual({
      ok: false,
      conflict: true,
      error: STUDY_FEEDBACK_CONFLICT_MESSAGE,
    })
    expect(shouldRunStudyFeedbackSideEffects(outcome)).toBe(false)
  })

  it('keeps previousComment from the protected pre-image on success', () => {
    const updated = {
      ...sampleRow,
      comment: '新コメント',
      stamp: 'excellent' as const,
      updated_at: '2026-09-21T02:00:00.000000+00:00',
    }
    const outcome = interpretConditionalUpdateResult({
      error: null,
      updatedRow: updated,
      previousComment: '旧コメント',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.previousComment).toBe('旧コメント')
    expect(outcome.feedback.updated_at).toBe(updated.updated_at)
    expect(didStudyFeedbackCommentChange({
      previousComment: outcome.previousComment,
      nextComment: updated.comment,
      wasInsert: false,
    })).toBe(true)
  })

  it('does not treat stamp-only change as comment change when previous matches', () => {
    expect(
      didStudyFeedbackCommentChange({
        previousComment: '同じ',
        nextComment: '同じ',
        wasInsert: false,
      }),
    ).toBe(false)
  })
})

describe('side-effect gate', () => {
  it('never enables side effects on conflict outcomes', () => {
    const notify = vi.fn()
    const clearReads = vi.fn()
    const conflictOutcomes = [
      interpretInsertResult({ error: { code: '23505' }, row: null }),
      interpretConditionalUpdateResult({
        error: null,
        updatedRow: null,
        previousComment: 'x',
      }),
    ]
    for (const outcome of conflictOutcomes) {
      if (shouldRunStudyFeedbackSideEffects(outcome)) {
        notify()
        clearReads()
      }
    }
    expect(notify).not.toHaveBeenCalled()
    expect(clearReads).not.toHaveBeenCalled()
  })
})
