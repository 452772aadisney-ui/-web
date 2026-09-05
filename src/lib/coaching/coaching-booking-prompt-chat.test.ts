import { describe, expect, it, vi } from 'vitest'
import { ensureBookingPromptChat } from '@/lib/coaching/coaching-booking-prompt-orchestrator'

describe('ensureBookingPromptChat week idempotency', () => {
  it('returns duplicate when a coaching_booking_reminder already exists this week', async () => {
    let insertCalls = 0
    const admin = {
      from(table: string) {
        if (table !== 'chat_messages') throw new Error(table)
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gte() {
                        return {
                          lt() {
                            return {
                              limit: async () => ({
                                data: [{ id: 'existing' }],
                                error: null,
                              }),
                            }
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          insert() {
            insertCalls += 1
            return { error: null }
          },
        }
      },
    }

    const result = await ensureBookingPromptChat({
      admin: admin as never,
      studentId: '11111111-1111-1111-1111-111111111111',
      weekMondayKey: '2026-09-01',
      weekEndExclusiveKey: '2026-09-08',
      adminSenderId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })

    expect(result).toBe('duplicate')
    expect(insertCalls).toBe(0)
  })

  it('creates once when no weekly reminder exists', async () => {
    let insertCalls = 0
    const admin = {
      from(table: string) {
        if (table !== 'chat_messages') throw new Error(table)
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gte() {
                        return {
                          lt() {
                            return {
                              limit: async () => ({ data: [], error: null }),
                            }
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          },
          insert() {
            insertCalls += 1
            return { error: null }
          },
        }
      },
    }

    const result = await ensureBookingPromptChat({
      admin: admin as never,
      studentId: '11111111-1111-1111-1111-111111111111',
      weekMondayKey: '2026-09-01',
      weekEndExclusiveKey: '2026-09-08',
      adminSenderId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })

    expect(result).toBe('created')
    expect(insertCalls).toBe(1)
  })
})
