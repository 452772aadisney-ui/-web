import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAdminClient,
  requireAdminAccess,
  assertAdminCanAccessStudent,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireAdminAccess: vi.fn(),
  assertAdminCanAccessStudent: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

vi.mock('@/lib/auth/admin-access', () => ({
  requireAdminAccess: (...args: unknown[]) => requireAdminAccess(...args),
  assertAdminCanAccessStudent: (...args: unknown[]) => assertAdminCanAccessStudent(...args),
}))

import {
  updateAdminStudentNotificationPreference,
  updateAdminStudentNotificationPreferencesBulk,
} from '@/lib/admin/notification-preferences-admin'

function mockAdminAuth(isSuperAdmin = true) {
  requireAdminAccess.mockResolvedValue({
    ok: true,
    profile: {
      id: 'admin-1',
      role: 'admin',
      is_super_admin: isSuperAdmin,
    },
    isSuperAdmin,
  })
  assertAdminCanAccessStudent.mockResolvedValue({ ok: true })
}

type PrefRow = {
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
  class_schedule: boolean
  updated_at?: string
}

function mockAdminDb(options: {
  prefs?: PrefRow | null
  updateEnabled?: boolean
}) {
  const prefs = options.prefs
  const auditInserts: Array<Record<string, unknown>> = []
  let current = prefs

  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'notification_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: current
                      ? {
                          ...current,
                          updated_at: current.updated_at ?? '2026-09-06T00:00:00.000Z',
                        }
                      : null,
                    error: null,
                  }),
                }
              },
            }
          },
          insert(payload: Record<string, unknown>) {
            current = {
              study_reminder: Boolean(payload.study_reminder),
              announcement: Boolean(payload.announcement),
              message: Boolean(payload.message),
              coaching_reminder: Boolean(payload.coaching_reminder),
              class_schedule: Boolean(payload.class_schedule),
              updated_at: '2026-09-06T00:00:00.000Z',
            }
            return Promise.resolve({ error: null })
          },
          update(patch: Record<string, boolean>) {
            return {
              eq() {
                return {
                  select() {
                    return {
                      maybeSingle: async () => {
                        if (!current) return { data: null, error: null }
                        current = { ...current, ...patch }
                        return {
                          data: options.updateEnabled === false ? null : { user_id: 'student-1' },
                          error: null,
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'notification_preference_changes') {
        return {
          insert(row: Record<string, unknown>) {
            auditInserts.push(row)
            return Promise.resolve({ error: null })
          },
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({ data: null, error: null }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(table)
    },
  })

  return { auditInserts, getPrefs: () => current }
}

describe('admin notification preferences control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminAuth()
  })

  it('rejects non-admin callers', async () => {
    requireAdminAccess.mockResolvedValue({ ok: false, error: '管理者権限が必要です' })

    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'study_reminder',
      enabled: false,
    })
    expect(result).toEqual({ ok: false, code: 'forbidden' })
  })

  it('rejects inaccessible student targets (incl. 既卒 for regular admin)', async () => {
    mockAdminAuth(false)
    assertAdminCanAccessStudent.mockResolvedValue({ ok: false, error: '対象が見つかりません' })
    createAdminClient.mockReturnValue({})

    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'graduate-1',
      category: 'study_reminder',
      enabled: false,
    })
    expect(result).toEqual({ ok: false, code: 'invalid_target' })
  })

  it('stops one category and writes audit without touching others', async () => {
    const db = mockAdminDb({
      prefs: {
        study_reminder: true,
        announcement: true,
        message: true,
        coaching_reminder: true,
        class_schedule: true,
      },
    })

    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'study_reminder',
      enabled: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.preferences.study_reminder).toBe(false)
    expect(result.snapshot.preferences.announcement).toBe(true)
    expect(db.auditInserts).toHaveLength(1)
    expect(db.auditInserts[0]).toMatchObject({
      target_user_id: 'student-1',
      changed_by_admin_id: 'admin-1',
      category: 'study_reminder',
      previous_value: true,
      new_value: false,
    })
  })

  it('bulk updates all categories', async () => {
    mockAdminDb({
      prefs: {
        study_reminder: true,
        announcement: true,
        message: true,
        coaching_reminder: true,
        class_schedule: true,
      },
    })

    const result = await updateAdminStudentNotificationPreferencesBulk({
      studentUserId: 'student-1',
      enabled: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.preferences).toEqual({
      study_reminder: false,
      announcement: false,
      message: false,
      coaching_reminder: false,
      class_schedule: false,
    })
  })
})
