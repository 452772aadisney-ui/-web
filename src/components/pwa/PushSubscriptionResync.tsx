'use client'

import { useEffect } from 'react'
import { silentResyncPushSubscription } from '@/lib/push/client'

/**
 * Silently re-syncs an existing granted Push subscription once per tab session.
 * Never requests notification permission.
 */
export function PushSubscriptionResync() {
  useEffect(() => {
    void silentResyncPushSubscription()
  }, [])

  return null
}
