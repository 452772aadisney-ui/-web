import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchStudentList,
  createClient,
  createAdminClient,
  processAnnouncementNewPath,
  sendEmailToMany,
  classifyAnnouncementDryRunFinal,
} = vi.hoisted(() => ({
  fetchStudentList: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  processAnnouncementNewPath: vi.fn(),
  sendEmailToMany: vi.fn(),
  classifyAnnouncementDryRunFinal: vi.fn(),
}))

vi.mock('@/lib/study/queries', () => ({
  fetchStudentList: (...args: unknown[]) => fetchStudentList(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock('@/lib/announcements/announcement-new-path', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/announcements/announcement-new-path')
  >('@/lib/announcements/announcement-new-path')
  return {
    ...actual,
    processAnnouncementNewPath: (...args: unknown[]) => processAnnouncementNewPath(...args),
  }
})

vi.mock('@/lib/email/send', () => ({
  sendEmailToMany: (...args: unknown[]) => sendEmailToMany(...args),
}))

vi.mock('@/lib/announcements/announcement-dry-run', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/announcements/announcement-dry-run')
  >('@/lib/announcements/announcement-dry-run')
  return {
    ...actual,
    classifyAnnouncementDryRunFinal: (...args: unknown[]) =>
      classifyAnnouncementDryRunFinal(...args),
  }
})

import { deliverAnnouncementNotifications } from '@/lib/announcements/announcement-orchestrator'

const STUDENT_A = '11111111-1111-1111-1111-111111111111'
const STUDENT_B = '22222222-2222-2222-2222-222222222222'

function stubAudience() {
  fetchStudentList.mockResolvedValue([
    {
      id: STUDENT_A,
      email: 'a@example.com',
      full_name: 'A',
      display_name: null,
    },
    {
      id: STUDENT_B,
      email: 'b@example.com',
      full_name: 'B',
      display_name: null,
    },
  ])
  createClient.mockResolvedValue({
    from() {
      return {
        select: async () => ({ data: [], error: null }),
      }
    },
  })
}

describe('deliverAnnouncementNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAudience()
    sendEmailToMany.mockResolvedValue({
      recipientCount: 2,
      sentCount: 2,
      skippedCount: 0,
      failedCount: 0,
      rateLimitedCount: 0,
      unprocessedCount: 0,
      timedOut: false,
    })
    processAnnouncementNewPath.mockResolvedValue('push_sent')
    classifyAnnouncementDryRunFinal.mockReturnValue('would_use_push')
    createAdminClient.mockReturnValue({
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                  is() {
                    return {
                      limit: async () => ({ data: [{ id: 'sub' }], error: null }),
                    }
                  },
                }
              },
            }
          },
        }
      },
    })
  })

  it('legacy: paced email only, no new-path', async () => {
    const summary = await deliverAnnouncementNotifications({
      announcementId: 'ann-1',
      title: 'T',
      targetAll: true,
      tagIds: [],
      studentIds: [],
      env: { ANNOUNCEMENT_DELIVERY_MODE: 'legacy' },
    })

    expect(summary.mode).toBe('legacy')
    expect(summary.recipients).toBe(2)
    expect(summary.legacyEmailSentCount).toBe(2)
    expect(processAnnouncementNewPath).not.toHaveBeenCalled()
    expect(sendEmailToMany).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ pace: true, omitRecipientFromLogs: true }),
    )
    expect(JSON.stringify(summary)).not.toContain('@')
  })

  it('allowlist empty forces legacy', async () => {
    const summary = await deliverAnnouncementNotifications({
      announcementId: 'ann-1',
      title: 'T',
      targetAll: true,
      tagIds: [],
      studentIds: [],
      env: {
        ANNOUNCEMENT_DELIVERY_MODE: 'allowlist',
        ANNOUNCEMENT_PUSH_ALLOWLIST: '',
      },
    })
    expect(summary.mode).toBe('legacy')
    expect(summary.forcedLegacyReason).toBe('allowlist_empty')
    expect(processAnnouncementNewPath).not.toHaveBeenCalled()
  })

  it('allowlist: only listed students use new path; others legacy email', async () => {
    const summary = await deliverAnnouncementNotifications({
      announcementId: 'ann-1',
      title: 'T',
      targetAll: true,
      tagIds: [],
      studentIds: [],
      env: {
        ANNOUNCEMENT_DELIVERY_MODE: 'allowlist',
        ANNOUNCEMENT_PUSH_ALLOWLIST: STUDENT_A,
        VERCEL_ENV: 'production',
        PUSH_SENDING_ENABLED: 'true',
      },
    })

    expect(summary.mode).toBe('allowlist')
    expect(processAnnouncementNewPath).toHaveBeenCalledTimes(1)
    expect(processAnnouncementNewPath).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ studentId: STUDENT_A }),
      }),
    )
    expect(summary.pushSucceeded).toBe(1)
    expect(sendEmailToMany).toHaveBeenCalled()
    const legacyEmails = sendEmailToMany.mock.calls[0]![0] as string[]
    expect(legacyEmails).toEqual(['b@example.com'])
  })

  it('all: every recipient uses new path', async () => {
    processAnnouncementNewPath
      .mockResolvedValueOnce('push_sent')
      .mockResolvedValueOnce('preference_disabled')

    const summary = await deliverAnnouncementNotifications({
      announcementId: 'ann-1',
      title: 'T',
      targetAll: true,
      tagIds: [],
      studentIds: [],
      env: {
        ANNOUNCEMENT_DELIVERY_MODE: 'all',
        VERCEL_ENV: 'production',
      },
    })

    expect(summary.mode).toBe('all')
    expect(processAnnouncementNewPath).toHaveBeenCalledTimes(2)
    expect(summary.pushSucceeded).toBe(1)
    expect(summary.preferenceDisabled).toBe(1)
    expect(sendEmailToMany).not.toHaveBeenCalled()
  })

  it('dry-run aggregates without calling new-path sends', async () => {
    const summary = await deliverAnnouncementNotifications({
      announcementId: 'ann-1',
      title: 'T',
      targetAll: true,
      tagIds: [],
      studentIds: [],
      env: { ANNOUNCEMENT_DELIVERY_MODE: 'dry-run' },
    })

    expect(summary.mode).toBe('dry-run')
    expect(summary.wouldUsePushFirst).toBe(2)
    expect(processAnnouncementNewPath).not.toHaveBeenCalled()
    expect(sendEmailToMany).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ pace: true }),
    )
  })
})
