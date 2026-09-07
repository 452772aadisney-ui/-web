import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY,
  CLASS_SCHEDULE_WRITE_RPC_SIGNATURES,
  isWithinSessionLimit,
  requireAdminClassScheduleRpcClient,
} from '@/lib/class-schedule/rpc-auth'

vi.mock('@/lib/class-schedule/access', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { requireAdmin } from '@/lib/class-schedule/access'
import { createAdminClient } from '@/lib/supabase/admin'

describe('isWithinSessionLimit', () => {
  it('allows 1..MAX', () => {
    expect(isWithinSessionLimit(1)).toBe(true)
    expect(isWithinSessionLimit(CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY)).toBe(true)
  })

  it('rejects empty, oversize, and non-integers', () => {
    expect(isWithinSessionLimit(0)).toBe(false)
    expect(isWithinSessionLimit(CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY + 1)).toBe(
      false,
    )
    expect(isWithinSessionLimit(1.5)).toBe(false)
  })
})

describe('CLASS_SCHEDULE_WRITE_RPC_SIGNATURES', () => {
  it('documents full signatures including create actor uuid', () => {
    expect(CLASS_SCHEDULE_WRITE_RPC_SIGNATURES.create).toContain('jsonb,uuid)')
    expect(CLASS_SCHEDULE_WRITE_RPC_SIGNATURES.bump).toBe(
      'public.bump_class_schedule_notify_revision(uuid,uuid)',
    )
    expect(CLASS_SCHEDULE_WRITE_RPC_SIGNATURES.isKisotsu).toBe(
      'public.is_kisotsu_profile()',
    )
  })
})

describe('requireAdminClassScheduleRpcClient', () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockReset()
    vi.mocked(createAdminClient).mockReset()
  })

  it('rejects when requireAdmin fails (student / unauthenticated)', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      error: '管理者権限が必要です',
    })
    const result = await requireAdminClassScheduleRpcClient()
    expect(result).toEqual({ ok: false, error: '管理者権限が必要です' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects when admin client is unavailable', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      profile: { id: 'admin-1', role: 'admin' } as never,
    })
    vi.mocked(createAdminClient).mockReturnValue(null)
    const result = await requireAdminClassScheduleRpcClient()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('授業予定の保存に失敗しました')
  })

  it('returns admin client only after admin gate', async () => {
    const admin = { rpc: vi.fn() }
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      profile: { id: 'admin-1', role: 'admin' } as never,
    })
    vi.mocked(createAdminClient).mockReturnValue(admin as never)
    const result = await requireAdminClassScheduleRpcClient()
    expect(result).toEqual({
      ok: true,
      profile: { id: 'admin-1', role: 'admin' },
      admin,
    })
  })
})
