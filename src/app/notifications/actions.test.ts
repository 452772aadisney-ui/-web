import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { updateNotificationPreference } from '@/app/notifications/actions'

describe('student notification preference updates', () => {
  it('always rejects category mutations from the student action', async () => {
    const result = await updateNotificationPreference({
      category: 'study_reminder',
      enabled: false,
    })
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
