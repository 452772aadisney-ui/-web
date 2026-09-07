import { describe, expect, it } from 'vitest'
import type { DeviceNotificationStatus } from '@/lib/push/device-status'
import {
  canEnablePushFromPrompt,
  shouldPromptPushSetup,
  shouldShowPushRecommendedItem,
} from '@/lib/push/setup-prompt'

const statuses: DeviceNotificationStatus[] = [
  'loading',
  'unsupported',
  'requires_standalone',
  'not_configured',
  'permission_denied',
  'permission_default',
  'ready_to_enable',
  'needs_sync',
  'subscribed',
  'network_error',
  'prefs_load_error',
]

describe('shouldPromptPushSetup', () => {
  it('hides when all admin categories are stopped', () => {
    for (const status of statuses) {
      expect(
        shouldPromptPushSetup({ status, anyCategoryEnabled: false }),
      ).toBe(false)
    }
  })

  it('shows for unsubscribed / blocked / unsupported device states', () => {
    expect(
      shouldPromptPushSetup({ status: 'permission_default', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'ready_to_enable', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'needs_sync', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'permission_denied', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'requires_standalone', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'unsupported', anyCategoryEnabled: true }),
    ).toBe(true)
    expect(
      shouldPromptPushSetup({ status: 'network_error', anyCategoryEnabled: true }),
    ).toBe(true)
  })

  it('hides while loading, when subscribed, or when not configured', () => {
    expect(shouldPromptPushSetup({ status: 'loading', anyCategoryEnabled: true })).toBe(
      false,
    )
    expect(
      shouldPromptPushSetup({ status: 'subscribed', anyCategoryEnabled: true }),
    ).toBe(false)
    expect(
      shouldPromptPushSetup({ status: 'not_configured', anyCategoryEnabled: true }),
    ).toBe(false)
  })
})

describe('canEnablePushFromPrompt', () => {
  it('allows enable only for default / ready / needs_sync', () => {
    expect(canEnablePushFromPrompt('permission_default')).toBe(true)
    expect(canEnablePushFromPrompt('ready_to_enable')).toBe(true)
    expect(canEnablePushFromPrompt('needs_sync')).toBe(true)
    expect(canEnablePushFromPrompt('permission_denied')).toBe(false)
    expect(canEnablePushFromPrompt('requires_standalone')).toBe(false)
    expect(canEnablePushFromPrompt('unsupported')).toBe(false)
    expect(canEnablePushFromPrompt('subscribed')).toBe(false)
    expect(canEnablePushFromPrompt('network_error')).toBe(false)
  })
})

describe('shouldShowPushRecommendedItem', () => {
  it('is device-local and ignores admin all-off as unreadiness', () => {
    expect(
      shouldShowPushRecommendedItem({
        status: 'ready_to_enable',
        anyCategoryEnabled: false,
      }),
    ).toBe(false)
  })

  it('hides when subscribed or unsupported', () => {
    expect(
      shouldShowPushRecommendedItem({
        status: 'subscribed',
        anyCategoryEnabled: true,
      }),
    ).toBe(false)
    expect(
      shouldShowPushRecommendedItem({
        status: 'unsupported',
        anyCategoryEnabled: true,
      }),
    ).toBe(false)
  })

  it('shows for iPhone install / denied / ready states', () => {
    expect(
      shouldShowPushRecommendedItem({
        status: 'requires_standalone',
        anyCategoryEnabled: true,
      }),
    ).toBe(true)
    expect(
      shouldShowPushRecommendedItem({
        status: 'permission_denied',
        anyCategoryEnabled: true,
      }),
    ).toBe(true)
    expect(
      shouldShowPushRecommendedItem({
        status: 'permission_default',
        anyCategoryEnabled: true,
      }),
    ).toBe(true)
  })
})
