/**
 * Pure UI status derivation for the student notification settings page.
 * Combines browser capability/permission/subscription with server DB flags.
 */

export type DeviceNotificationStatus =
  | 'loading'
  | 'unsupported'
  | 'requires_standalone'
  | 'not_configured'
  | 'permission_denied'
  | 'permission_default'
  | 'ready_to_enable'
  | 'needs_sync'
  | 'subscribed'
  | 'network_error'
  | 'prefs_load_error'

export type DeviceNotificationInputs = {
  supported: boolean
  requiresStandalone: boolean
  configured: boolean
  permission: 'default' | 'granted' | 'denied' | 'unsupported'
  hasBrowserSubscription: boolean
  /** True when this account has any active DB subscription (may be another device). */
  serverSubscribed: boolean
  serverStatusFailed: boolean
}

export function deriveDeviceNotificationStatus(
  input: DeviceNotificationInputs,
): DeviceNotificationStatus {
  if (input.requiresStandalone) return 'requires_standalone'
  if (!input.supported) return 'unsupported'
  if (!input.configured) return 'not_configured'
  if (input.permission === 'denied') return 'permission_denied'
  if (input.serverStatusFailed) return 'network_error'

  if (input.hasBrowserSubscription) {
    // This device has a browser subscription; treat as subscribed only when DB is also active.
    if (input.serverSubscribed) return 'subscribed'
    return 'needs_sync'
  }

  if (input.permission === 'default') return 'permission_default'
  // granted or unsupported-but-supported path without browser sub
  return 'ready_to_enable'
}

export function deviceStatusHeadline(status: DeviceNotificationStatus): string {
  switch (status) {
    case 'loading':
      return '通知の状態を確認しています…'
    case 'unsupported':
      return 'このブラウザでは通知を利用できません'
    case 'requires_standalone':
      return 'ホーム画面から開くと通知を利用できます'
    case 'not_configured':
      return '通知の準備が完了していません'
    case 'permission_denied':
      return 'ブラウザの設定で通知がブロックされています'
    case 'permission_default':
      return 'この端末では通知がまだ有効になっていません'
    case 'ready_to_enable':
      return 'この端末では通知がまだ有効になっていません'
    case 'needs_sync':
      return 'この端末の通知を同期する必要があります'
    case 'subscribed':
      return 'この端末で通知を受け取ります'
    case 'network_error':
      return '通信エラーのため状態を確認できませんでした'
    case 'prefs_load_error':
      return '通知設定を読み込めませんでした'
    default:
      return '通知の状態を確認できませんでした'
  }
}

export function deviceStatusDetail(status: DeviceNotificationStatus): string | null {
  switch (status) {
    case 'requires_standalone':
      return 'iPhone・iPadで通知を受け取るには、このサイトをホーム画面に追加し、ホーム画面のアイコンから開いてください。'
    case 'permission_denied':
      return 'ブラウザまたは端末の設定から「受験生web」の通知を許可してください。許可したあと、この画面に戻ってもう一度状態を確認できます。'
    case 'not_configured':
      return 'しばらくしてから再度お試しください。'
    case 'needs_sync':
      return '「この端末で通知を受け取る」を押すと、設定をこの端末に合わせます。'
    case 'network_error':
      return '時間をおいて再度お試しください。'
    case 'prefs_load_error':
      return '時間をおいて再読み込みしてください。表示をすべてオフにはしていません。'
    default:
      return null
  }
}
