import { describe, expect, it } from 'vitest'
import {
  normalizeAudienceScope,
  regularAdminMayManageAudienceScope,
  targetingIncludesKisotsu,
} from '@/lib/announcements/audience-scope'

describe('announcement audience scope', () => {
  it('maps legacy target_all when scope missing', () => {
    expect(normalizeAudienceScope(undefined, true)).toBe('all')
    expect(normalizeAudienceScope(undefined, false)).toBe('targeted')
    expect(normalizeAudienceScope('enrolled', false)).toBe('enrolled')
  })

  it('restricts regular admin manageable scopes', () => {
    expect(regularAdminMayManageAudienceScope('enrolled')).toBe(true)
    expect(regularAdminMayManageAudienceScope('targeted')).toBe(true)
    expect(regularAdminMayManageAudienceScope('all')).toBe(false)
  })

  it('detects kisotsu in tags or student ids without silent strip', () => {
    expect(
      targetingIncludesKisotsu({
        tagIds: ['t1'],
        studentIds: [],
        tags: [{ id: 't1', category: '学年', name: '既卒' }],
        kisotsuStudentIds: new Set(),
      }),
    ).toBe(true)
    expect(
      targetingIncludesKisotsu({
        tagIds: [],
        studentIds: ['s1'],
        tags: [],
        kisotsuStudentIds: new Set(['s1']),
      }),
    ).toBe(true)
    expect(
      targetingIncludesKisotsu({
        tagIds: ['t2'],
        studentIds: ['s2'],
        tags: [{ id: 't2', category: '学年', name: '高3' }],
        kisotsuStudentIds: new Set(['s1']),
      }),
    ).toBe(false)
  })
})
