'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  deriveDeviceNotificationStatus,
  type DeviceNotificationStatus,
} from '@/lib/push/device-status'
import {
  fetchPushServerStatus,
  getCurrentPushSubscription,
  getLocalPushState,
  likelyRequiresStandaloneForPush,
} from '@/lib/push/client'
import { getVapidPublicKey } from '@/lib/push/env'

export type DeviceNotificationSnapshot = {
  status: DeviceNotificationStatus
  hasBrowserSubscription: boolean
  showIosGuide: boolean
  sendingEnabled: boolean
  refresh: () => Promise<void>
}

/**
 * Shared device status used by notification settings and dashboard prompts.
 * Does not request permission or subscribe — only reads local + server state.
 */
export function useDeviceNotificationStatus(): DeviceNotificationSnapshot {
  const [status, setStatus] = useState<DeviceNotificationStatus>('loading')
  const [hasBrowserSubscription, setHasBrowserSubscription] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [sendingEnabled, setSendingEnabled] = useState(false)

  const refresh = useCallback(async () => {
    const local = getLocalPushState()
    const configured = Boolean(getVapidPublicKey()) || local.configured
    const requiresStandalone = likelyRequiresStandaloneForPush()
    setShowIosGuide(requiresStandalone)

    let browserSubscription = false
    try {
      const sub = await getCurrentPushSubscription()
      browserSubscription = Boolean(sub)
    } catch {
      browserSubscription = false
    }
    setHasBrowserSubscription(browserSubscription)

    let serverSubscribed = false
    let serverStatusFailed = false
    let nextSendingEnabled = false
    const server = await fetchPushServerStatus()
    if (server.ok) {
      serverSubscribed = server.value.subscribed
      nextSendingEnabled = server.value.sendingEnabled
    } else if (server.code === 'network' || server.code === 'unknown') {
      serverStatusFailed = true
    }
    setSendingEnabled(nextSendingEnabled)

    const permission =
      local.permission === 'granted' ||
      local.permission === 'denied' ||
      local.permission === 'default'
        ? local.permission
        : 'unsupported'

    setStatus(
      deriveDeviceNotificationStatus({
        supported: local.supported,
        requiresStandalone,
        configured,
        permission,
        hasBrowserSubscription: browserSubscription,
        serverSubscribed,
        serverStatusFailed,
      }),
    )
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onFocus = () => {
      void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return {
    status,
    hasBrowserSubscription,
    showIosGuide,
    sendingEnabled,
    refresh,
  }
}
