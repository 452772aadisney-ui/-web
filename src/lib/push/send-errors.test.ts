import { describe, expect, it } from 'vitest'
import { classifyPushSendFailure } from '@/lib/push/send-errors'

describe('classifyPushSendFailure', () => {
  it('disables only on 404/410', () => {
    expect(classifyPushSendFailure({ statusCode: 404 })).toMatchObject({
      errorCode: 'gone',
      shouldDisableSubscription: true,
    })
    expect(classifyPushSendFailure({ statusCode: 410 })).toMatchObject({
      errorCode: 'gone',
      shouldDisableSubscription: true,
    })
  })

  it('treats 429 and 5xx as transient without disable', () => {
    expect(classifyPushSendFailure({ statusCode: 429 })).toMatchObject({
      errorCode: 'transient',
      shouldDisableSubscription: false,
    })
    expect(classifyPushSendFailure({ statusCode: 503 })).toMatchObject({
      errorCode: 'transient',
      shouldDisableSubscription: false,
    })
  })

  it('does not embed response bodies', () => {
    const classified = classifyPushSendFailure({
      statusCode: 400,
      body: 'endpoint=https://secret.example/push',
    })
    expect(JSON.stringify(classified)).not.toContain('secret.example')
    expect(classified.errorCode).toBe('client_error')
  })
})
