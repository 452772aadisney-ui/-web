import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifyStudyFeedbackReceived = vi.fn()
const requireAdminAccess = vi.fn()
const assertAdminCanAccessStudent = vi.fn()
const createClient = vi.fn()

vi.mock('@/lib/email/notifications', () => ({
  notifyStudyFeedbackReceived: (...args: unknown[]) =>
    notifyStudyFeedbackReceived(...args),
}))

vi.mock('@/lib/auth/admin-access', () => ({
  requireAdminAccess: (...args: unknown[]) => requireAdminAccess(...args),
  assertAdminCanAccessStudent: (...args: unknown[]) =>
    assertAdminCanAccessStudent(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { upsertStudyDayFeedback } from '@/app/admin/study-daily/actions'
import { STUDY_FEEDBACK_CONFLICT_MESSAGE } from '@/lib/study/study-day-feedback-write'

function form(data: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value)
  }
  return fd
}

describe('upsertStudyDayFeedback conditional writes (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminAccess.mockResolvedValue({
      ok: true,
      profile: { id: 'admin-1', role: 'admin', is_super_admin: true },
      isSuperAdmin: true,
    })
    assertAdminCanAccessStudent.mockResolvedValue({ ok: true })
  })

  it('maps concurrent INSERT unique violation to conflict and skips notify/read reset', async () => {
    const deleteReads = vi.fn()
    createClient.mockResolvedValue({
      from(table: string) {
        if (table === 'study_day_feedback') {
          return {
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate' },
                }),
              }),
            }),
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'fb-other',
                      student_id: 'student-1',
                      studied_on: '2026-09-21',
                      stamp: 'good',
                      comment: '先勝ち',
                      admin_id: 'admin-2',
                      created_at: '2026-09-21T01:00:00.000000+00:00',
                      updated_at: '2026-09-21T01:00:00.000000+00:00',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'study_day_feedback_reads') {
          return { delete: () => ({ eq: () => ({ eq: deleteReads }) }) }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })

    const result = await upsertStudyDayFeedback(
      {},
      form({
        studentId: 'student-1',
        studiedOn: '2026-09-21',
        stamp: 'nice',
        comment: '後から',
        expectedFeedbackId: '',
        expectedUpdatedAt: '',
      }),
    )

    expect(result.conflict).toBe(true)
    expect(result.error).toBe(STUDY_FEEDBACK_CONFLICT_MESSAGE)
    expect(result.success).toBeUndefined()
    expect(notifyStudyFeedbackReceived).not.toHaveBeenCalled()
    expect(deleteReads).not.toHaveBeenCalled()
  })

  it('rejects stale UPDATE (0 rows) after another admin changed version/stamp', async () => {
    const deleteReads = vi.fn()
    const expectedUpdatedAt = '2026-09-21T01:00:00.123456+00:00'

    createClient.mockResolvedValue({
      from(table: string) {
        if (table === 'study_day_feedback') {
          return {
            select: () => ({
              eq: (_col: string, value: string) => ({
                eq: (_col2: string, value2: string) => ({
                  maybeSingle: async () => {
                    // Version pre-image miss OR latest fetch after conflict.
                    if (value === 'fb-1' && value2 === expectedUpdatedAt) {
                      return { data: null, error: null }
                    }
                    return {
                      data: {
                        id: 'fb-1',
                        student_id: 'student-1',
                        studied_on: '2026-09-21',
                        stamp: 'excellent',
                        comment: '同じコメント',
                        admin_id: 'admin-2',
                        created_at: '2026-09-21T01:00:00.123456+00:00',
                        updated_at: '2026-09-21T02:00:00.000000+00:00',
                      },
                      error: null,
                    }
                  },
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'study_day_feedback_reads') {
          return { delete: () => ({ eq: () => ({ eq: deleteReads }) }) }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })

    const result = await upsertStudyDayFeedback(
      {},
      form({
        studentId: 'student-1',
        studiedOn: '2026-09-21',
        stamp: 'nice',
        comment: '同じコメント',
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt,
      }),
    )

    expect(result.conflict).toBe(true)
    expect(result.error).toBe(STUDY_FEEDBACK_CONFLICT_MESSAGE)
    expect(result.latestFeedback?.updated_at).toBe('2026-09-21T02:00:00.000000+00:00')
    expect(notifyStudyFeedbackReceived).not.toHaveBeenCalled()
    expect(deleteReads).not.toHaveBeenCalled()
  })

  it('updates only when id+updated_at match and then runs comment side effects', async () => {
    const expectedUpdatedAt = '2026-09-21T01:00:00.123456+00:00'
    const newUpdatedAt = '2026-09-21T03:00:00.999999+00:00'
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    createClient.mockResolvedValue({
      from(table: string) {
        if (table === 'study_day_feedback') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'fb-1',
                      comment: '旧',
                      updated_at: expectedUpdatedAt,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: { comment: string }) => ({
              eq: (col: string, value: string) => {
                expect(col).toBe('id')
                expect(value).toBe('fb-1')
                return {
                  eq: (col2: string, value2: string) => {
                    expect(col2).toBe('updated_at')
                    expect(value2).toBe(expectedUpdatedAt)
                    return {
                      select: () => ({
                        maybeSingle: async () => ({
                          data: {
                            id: 'fb-1',
                            student_id: 'student-1',
                            studied_on: '2026-09-21',
                            stamp: 'good',
                            comment: payload.comment,
                            admin_id: 'admin-1',
                            created_at: '2026-09-21T01:00:00.123456+00:00',
                            updated_at: newUpdatedAt,
                          },
                          error: null,
                        }),
                      }),
                    }
                  },
                }
              },
            }),
          }
        }
        if (table === 'study_day_feedback_reads') {
          return {
            delete: () => ({
              eq: () => ({
                eq: deleteEq,
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })

    const result = await upsertStudyDayFeedback(
      {},
      form({
        studentId: 'student-1',
        studiedOn: '2026-09-21',
        stamp: 'good',
        comment: '新',
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt,
      }),
    )

    expect(result).toMatchObject({
      success: true,
      feedbackId: 'fb-1',
      updatedAt: newUpdatedAt,
      comment: '新',
    })
    expect(notifyStudyFeedbackReceived).toHaveBeenCalledOnce()
    expect(deleteEq).toHaveBeenCalled()
  })

  it('rejects when pre-image matches but conditional UPDATE returns 0 rows', async () => {
    const deleteReads = vi.fn()
    const expectedUpdatedAt = '2026-09-21T01:00:00.123456+00:00'
    let selectCalls = 0

    createClient.mockResolvedValue({
      from(table: string) {
        if (table === 'study_day_feedback') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    selectCalls += 1
                    if (selectCalls === 1) {
                      return {
                        data: {
                          id: 'fb-1',
                          comment: '同じコメント',
                          updated_at: expectedUpdatedAt,
                        },
                        error: null,
                      }
                    }
                    return {
                      data: {
                        id: 'fb-1',
                        student_id: 'student-1',
                        studied_on: '2026-09-21',
                        stamp: 'excellent',
                        comment: '同じコメント',
                        admin_id: 'admin-2',
                        created_at: expectedUpdatedAt,
                        updated_at: '2026-09-21T02:00:00.000000+00:00',
                      },
                      error: null,
                    }
                  },
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'study_day_feedback_reads') {
          return { delete: () => ({ eq: () => ({ eq: deleteReads }) }) }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })

    const result = await upsertStudyDayFeedback(
      {},
      form({
        studentId: 'student-1',
        studiedOn: '2026-09-21',
        stamp: 'nice',
        comment: '同じコメント',
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt,
      }),
    )

    expect(result.conflict).toBe(true)
    expect(notifyStudyFeedbackReceived).not.toHaveBeenCalled()
    expect(deleteReads).not.toHaveBeenCalled()
  })

  it('does not allow update without expectedUpdatedAt (no protection bypass)', async () => {
    createClient.mockResolvedValue({
      from() {
        throw new Error('should not write')
      },
    })

    const result = await upsertStudyDayFeedback(
      {},
      form({
        studentId: 'student-1',
        studiedOn: '2026-09-21',
        stamp: 'good',
        comment: 'x',
        expectedFeedbackId: 'fb-1',
        expectedUpdatedAt: '',
      }),
    )

    expect(result.conflict).toBe(true)
    expect(result.success).toBeUndefined()
    expect(notifyStudyFeedbackReceived).not.toHaveBeenCalled()
  })
})
