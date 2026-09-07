'use client'

import { isStandaloneDisplayMode } from '@/lib/push/client'
import type { DeviceNotificationStatus } from '@/lib/push/device-status'
import { detectPushClientPlatform } from '@/lib/push/platform'

/**
 * Device-specific setup copy shared by notification settings and dashboard prompts.
 * Never requests permission — display only.
 */
export function PushSetupGuidance({
  status,
  showIosGuide,
}: {
  status: DeviceNotificationStatus
  showIosGuide: boolean
}) {
  const platform = detectPushClientPlatform()
  const showIosSteps =
    (status === 'requires_standalone' || showIosGuide) &&
    !isStandaloneDisplayMode() &&
    (platform === 'ios' || status === 'requires_standalone')

  if (showIosSteps) {
    return (
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Safariで受験生webを開く</li>
        <li>共有ボタンを押す</li>
        <li>「ホーム画面に追加」を選ぶ</li>
        <li>ホーム画面に追加した受験生webを開く</li>
        <li>通知設定から通知を許可する</li>
      </ol>
    )
  }

  if (status === 'unsupported') {
    return (
      <p className="mt-3 text-sm text-muted">
        Chrome・Edgeなどの対応ブラウザで開き直してください。このブラウザでは通知を有効にできません。
      </p>
    )
  }

  if (status === 'permission_denied') {
    return (
      <p className="mt-3 text-sm text-muted">
        ブラウザまたは端末の設定から「受験生web」の通知を許可してください。許可ダイアログはここからは再表示できません。
      </p>
    )
  }

  if (
    status === 'permission_default' ||
    status === 'ready_to_enable' ||
    status === 'needs_sync'
  ) {
    if (platform === 'android') {
      return (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Chromeなどの対応ブラウザで「通知を設定する」を押す</li>
          <li>表示された通知許可で「許可」を選ぶ</li>
        </ul>
      )
    }
    if (platform === 'desktop') {
      return (
        <p className="mt-3 text-sm text-muted">
          Chrome・Edgeなどの対応ブラウザで通知を許可してください。
        </p>
      )
    }
  }

  return null
}
