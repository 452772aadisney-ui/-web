import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

vi.mock('@/lib/auth/get-profile', () => ({
  getCurrentProfile: vi.fn(),
}))

import {
  ADMIN_STUDENT_NOT_FOUND,
  filterGraduatesFromStudentIds,
  isSuperAdminProfile,
} from '@/lib/auth/admin-access'
import type { Profile } from '@/types/database'

function profile(over: Partial<Profile>): Profile {
  return {
    id: 'x',
    email: 'a@b.c',
    full_name: 'n',
    full_name_kana: null,
    display_name: 'n',
    birthday: null,
    target_schools: [],
    subjects: [],
    student_code: null,
    role: 'admin',
    is_super_admin: false,
    admin_since: null,
    faq_intro_seen_at: null,
    last_accessed_at: null,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function mockKisotsuLookup(kisotsuIds: string[]) {
  createClient.mockResolvedValue({
    from(table: string) {
      if (table === 'student_tags') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: { id: 'tag-kisotsu' },
                        error: null,
                      }),
                    }
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'profile_student_tags') {
        return {
          select() {
            return {
              eq() {
                return {
                  in: async () => ({
                    data: kisotsuIds.map((profile_id) => ({ profile_id })),
                    error: null,
                  }),
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })
}

describe('admin privilege helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects super admin only when role=admin and flag true', () => {
    expect(isSuperAdminProfile(profile({ is_super_admin: true }))).toBe(true)
    expect(isSuperAdminProfile(profile({ is_super_admin: false }))).toBe(false)
    expect(
      isSuperAdminProfile(profile({ role: 'student', is_super_admin: true })),
    ).toBe(false)
  })

  it('uses uniform not-found copy for graduate denial', () => {
    expect(ADMIN_STUDENT_NOT_FOUND).toBe('対象が見つかりません')
  })

  it('filterGraduatesFromStudentIds keeps unique ids for super admin without DB', async () => {
    const result = await filterGraduatesFromStudentIds(['s1', 's2', 's1', ''], {
      isSuperAdmin: true,
    })
    expect(result).toEqual(['s1', 's2'])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('filterGraduatesFromStudentIds drops 既卒 before list work for regular admin', async () => {
    mockKisotsuLookup(['s2'])
    const result = await filterGraduatesFromStudentIds(['s1', 's2', 's3'], {
      isSuperAdmin: false,
    })
    expect(result).toEqual(['s1', 's3'])
  })

  it('filterGraduatesFromStudentIds returns empty when all ids are graduates', async () => {
    mockKisotsuLookup(['g1', 'g2'])
    const result = await filterGraduatesFromStudentIds(['g1', 'g2'], {
      isSuperAdmin: false,
    })
    expect(result).toEqual([])
  })
})
