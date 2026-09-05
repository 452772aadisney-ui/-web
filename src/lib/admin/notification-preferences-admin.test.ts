import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClient,
  createAdminClient,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

import {
  updateAdminStudentNotificationPreference,
  updateAdminStudentNotificationPreferencesBulk,
} from '@/lib/admin/notification-preferences-admin'

function mockAdminAuth() {
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: { role: 'admin' }, error: null }),
              }
            },
          }
        },
      }
    },
  })
}

type PrefRow = {
  study_reminder: boolean
  announcement: boolean
  message: boolean
  coaching_reminder: boolean
  updated_at?: string
}

function mockAdminDb(options: {
  studentRole?: string
  prefs?: PrefRow | null
  updateEnabled?: boolean
}) {
  const prefs = options.prefs
  const auditInserts: Array<Record<string, unknown>> = []
  let current = prefs

  createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data:
                      options.studentRole === 'missing'
                        ? null
                        : {
                            id: 'student-1',
                            role: options.studentRole ?? 'student',
                            full_name: 'Admin',
                            display_name: 'Admin',
                          },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      }

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
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'stu' } } }) },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { role: 'student' }, error: null }),
                }
              },
            }
          },
        }
      },
    })

    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'study_reminder',
      enabled: false,
    })
    expect(result).toEqual({ ok: false, code: 'forbidden' })
  })

  it('rejects non-student targets', async () => {
    mockAdminDb({ studentRole: 'admin' })
    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'admin-2',
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
      },
    })

    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'study_reminder',
      enabled: false,
      reason: 'test stop',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.preferences.study_reminder).toBe(false)
    expect(result.snapshot.preferences.announcement).toBe(true)
    expect(db.auditInserts).toHaveLength(1)
    expect(db.auditInserts[0]).toMatchObject({
      category: 'study_reminder',
      previous_value: true,
      new_value: false,
    })
    expect(JSON.stringify(result.snapshot)).not.toContain('@')
  })

  it('creates defaults then disables when row is missing', async () => {
    const db = mockAdminDb({ prefs: null })
    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'message',
      enabled: false,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.preferences.message).toBe(false)
    expect(result.snapshot.preferences.study_reminder).toBe(true)
    expect(db.auditInserts).toHaveLength(1)
  })

  it('bulk stop writes per-category audits', async () => {
    const db = mockAdminDb({
      prefs: {
        study_reminder: true,
        announcement: true,
        message: true,
        coaching_reminder: true,
      },
    })

    const result = await updateAdminStudentNotificationPreferencesBulk({
      studentUserId: 'student-1',
      enabled: false,
    })
    expect(result.ok).toBe(true)
    expect(db.auditInserts).toHaveLength(4)
  })

  it('skips audit when value is unchanged', async () => {
    const db = mockAdminDb({
      prefs: {
        study_reminder: false,
        announcement: true,
        message: true,
        coaching_reminder: true,
      },
    })
    const result = await updateAdminStudentNotificationPreference({
      studentUserId: 'student-1',
      category: 'study_reminder',
      enabled: false,
    })
    expect(result.ok).toBe(true)
    expect(db.auditInserts).toHaveLength(0)
  })
})
