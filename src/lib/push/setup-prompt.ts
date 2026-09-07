import type { DeviceNotificationStatus } from '@/lib/push/device-status'

/**
 * Whether the dashboard "通知をオンにしてください" promo should show.
 * Requires at least one admin category enabled; never treats unknown as subscribed.
 */
export function shouldPromptPushSetup(input: {
  status: DeviceNotificationStatus
  anyCategoryEnabled: boolean
}): boolean {
  if (!input.anyCategoryEnabled) return false

  switch (input.status) {
    case 'loading':
    case 'subscribed':
    case 'not_configured':
    case 'prefs_load_error':
      return false
    case 'permission_default':
    case 'ready_to_enable':
    case 'needs_sync':
    case 'permission_denied':
    case 'requires_standalone':
    case 'unsupported':
    case 'network_error':
      return true
    default:
      return false
  }
}

/** Direct enable is only safe when permission dialog / subscribe may succeed. */
export function canEnablePushFromPrompt(status: DeviceNotificationStatus): boolean {
  return (
    status === 'permission_default' ||
    status === 'ready_to_enable' ||
    status === 'needs_sync'
  )
}

/**
 * Recommended checklist row: device-local, does not affect required onboarding.
 * Hidden when categories are all off or the device cannot use push at all.
 */
export function shouldShowPushRecommendedItem(input: {
  status: DeviceNotificationStatus
  anyCategoryEnabled: boolean
}): boolean {
  if (!input.anyCategoryEnabled) return false
  if (input.status === 'loading' || input.status === 'not_configured') return false
  if (input.status === 'unsupported') return false
  return input.status !== 'subscribed'
}
