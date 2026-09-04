'use client'

import { useEffect } from 'react'
import { registerPushServiceWorker } from '@/lib/push/register-service-worker'

/**
 * Silently registers the Push Service Worker on student dashboard routes.
 * Does not request notification permission or create Push subscriptions.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerPushServiceWorker()
  }, [])

  return null
}
