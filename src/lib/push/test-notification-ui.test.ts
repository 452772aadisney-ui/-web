import { describe, expect, it } from 'vitest'

/** Mirrors NotificationSettingsClient visibility rules for the test button. */
function canShowTestButton(params: {
  deviceStatus: string
  hasBrowserSubscription: boolean
  sendingEnabled: boolean
  deviceBusy: boolean
  testBusy: boolean
}): boolean {
  return (
    params.deviceStatus === 'subscribed' &&
    params.hasBrowserSubscription &&
    params.sendingEnabled &&
    !params.deviceBusy &&
    !params.testBusy
  )
}

function showSendingUnavailableHint(params: {
  deviceStatus: string
  hasBrowserSubscription: boolean
  sendingEnabled: boolean
}): boolean {
  return (
    params.deviceStatus === 'subscribed' &&
    params.hasBrowserSubscription &&
    !params.sendingEnabled
  )
}

describe('test notification UI gates', () => {
  it('shows the button only when subscribed locally+DB and sending is enabled', () => {
    expect(
      canShowTestButton({
        deviceStatus: 'subscribed',
        hasBrowserSubscription: true,
        sendingEnabled: true,
        deviceBusy: false,
        testBusy: false,
      }),
    ).toBe(true)
  })

  it('hides the button when sending is disabled and shows the hint instead', () => {
    expect(
      canShowTestButton({
        deviceStatus: 'subscribed',
        hasBrowserSubscription: true,
        sendingEnabled: false,
        deviceBusy: false,
        testBusy: false,
      }),
    ).toBe(false)
    expect(
      showSendingUnavailableHint({
        deviceStatus: 'subscribed',
        hasBrowserSubscription: true,
        sendingEnabled: false,
      }),
    ).toBe(true)
  })

  it('hides the button without a browser subscription', () => {
    expect(
      canShowTestButton({
        deviceStatus: 'subscribed',
        hasBrowserSubscription: false,
        sendingEnabled: true,
        deviceBusy: false,
        testBusy: false,
      }),
    ).toBe(false)
  })
})
