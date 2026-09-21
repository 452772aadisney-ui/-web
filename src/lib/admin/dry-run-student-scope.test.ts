import { describe, expect, it } from 'vitest'
import {
  dryRunGateKey,
  resolveAdminDryRunAudienceScope,
} from '@/lib/admin/dry-run-student-scope'

describe('dry-run student scope', () => {
  it('maps regular admin to enrolled and super to all', () => {
    expect(resolveAdminDryRunAudienceScope(false)).toBe('enrolled')
    expect(resolveAdminDryRunAudienceScope(true)).toBe('all')
  })

  it('keeps separate gate keys per audience scope', () => {
    expect(dryRunGateKey('a1', 'enrolled')).not.toBe(dryRunGateKey('a1', 'all'))
    expect(dryRunGateKey('a1', 'enrolled')).toBe(dryRunGateKey('a1', 'enrolled'))
  })
})
