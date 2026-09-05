import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, processMessageNewPath, sendStudentMessageEmail } = vi.hoisted(() => ({
  createClient: vi.fn(),
  processMessageNewPath: vi.fn(),
  sendStudentMessageEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

vi.mock('@/lib/chat/message-new-path', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/message-new-path')>(
    '@/lib/chat/message-new-path',
  )
  return {
    ...actual,
    processMessageNewPath: (...args: unknown[]) => processMessageNewPath(...args),
  }
})

vi.mock('@/lib/chat/message-email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/message-email')>(
    '@/lib/chat/message-email',
  )
  return {
    ...actual,
    sendStudentMessageEmail: (...args: unknown[]) => sendStudentMessageEmail(...args),
  }
})

import { deliverStudentMessageNotification } from '@/lib/chat/message-orchestrator'

const STUDENT = '11111111-1111-1111-1111-111111111111'
const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('deliverStudentMessageNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClient.mockResolvedValue({
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { email: 's@example.com' },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    })
    sendStudentMessageEmail.mockResolvedValue({ ok: true, httpStatus: 200 })
    processMessageNewPath.mockResolvedValue('push_sent')
  })

  it('skips student→admin (not student recipient path)', async () => {
    const summary = await deliverStudentMessageNotification({
      messageId: 'm1',
      studentId: STUDENT,
      senderId: STUDENT,
      senderRole: 'student',
      messageKind: 'user',
      body: 'hi',
      env: { MESSAGE_DELIVERY_MODE: 'all' },
    })
    expect(summary.skippedReason).toBe('not_student_recipient')
    expect(processMessageNewPath).not.toHaveBeenCalled()
    expect(sendStudentMessageEmail).not.toHaveBeenCalled()
  })

  it('skips coaching_booking_reminder kind', async () => {
    const summary = await deliverStudentMessageNotification({
      messageId: 'm1',
      studentId: STUDENT,
      senderId: ADMIN,
      senderRole: 'admin',
      messageKind: 'coaching_booking_reminder',
      body: 'book please',
      env: { MESSAGE_DELIVERY_MODE: 'all' },
    })
    expect(summary.skippedReason).toBe('excluded_kind')
    expect(processMessageNewPath).not.toHaveBeenCalled()
    expect(sendStudentMessageEmail).not.toHaveBeenCalled()
  })

  it('legacy: paced student email only', async () => {
    const summary = await deliverStudentMessageNotification({
      messageId: 'm1',
      studentId: STUDENT,
      senderId: ADMIN,
      senderRole: 'admin',
      messageKind: 'user',
      body: 'hello',
      env: { MESSAGE_DELIVERY_MODE: 'legacy' },
    })
    expect(summary.mode).toBe('legacy')
    expect(summary.legacyEmailSent).toBe(true)
    expect(processMessageNewPath).not.toHaveBeenCalled()
    expect(sendStudentMessageEmail).toHaveBeenCalled()
  })

  it('all: uses new path', async () => {
    const summary = await deliverStudentMessageNotification({
      messageId: 'm1',
      studentId: STUDENT,
      senderId: ADMIN,
      senderRole: 'admin',
      messageKind: 'user',
      body: 'hello',
      env: { MESSAGE_DELIVERY_MODE: 'all', VERCEL_ENV: 'production' },
    })
    expect(summary.mode).toBe('all')
    expect(summary.pushSucceeded).toBe(1)
    expect(processMessageNewPath).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', studentUserId: STUDENT }),
    )
  })

  it('allowlist miss uses legacy email without new path', async () => {
    const summary = await deliverStudentMessageNotification({
      messageId: 'm1',
      studentId: STUDENT,
      senderId: ADMIN,
      senderRole: 'admin',
      messageKind: 'user',
      body: 'hello',
      env: {
        MESSAGE_DELIVERY_MODE: 'allowlist',
        MESSAGE_PUSH_ALLOWLIST: '22222222-2222-2222-2222-222222222222',
      },
    })
    expect(summary.mode).toBe('allowlist')
    expect(processMessageNewPath).not.toHaveBeenCalled()
    expect(summary.legacyEmailSent).toBe(true)
  })
})
