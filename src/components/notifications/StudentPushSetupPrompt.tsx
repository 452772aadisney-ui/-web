'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'
import { PushSetupGuidance } from '@/components/notifications/PushSetupGuidance'
import type { DeviceNotificationSnapshot } from '@/hooks/useDeviceNotificationStatus'
import { enablePushSubscriptionFromUser } from '@/lib/push/client'
import {
  canEnablePushFromPrompt,
  shouldPromptPushSetup,
} from '@/lib/push/setup-prompt'
import { createToastSession } from '@/lib/toast/app-toast'

const NOTIFICATIONS_HREF = '/dashboard/notifications'

type Props = {
  anyCategoryEnabled: boolean
  device: DeviceNotificationSnapshot
}

/**
 * Dashboard promo for this-device push setup.
 * Permission / subscribe run only after an explicit button press.
 */
export function StudentPushSetupPrompt({ anyCategoryEnabled, device }: Props) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const descId = `${baseId}-desc`
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  if (
    !shouldPromptPushSetup({
      status: device.status,
      anyCategoryEnabled,
    })
  ) {
    return null
  }

  const enableAllowed = canEnablePushFromPrompt(device.status)

  async function handleEnable() {
    if (busyRef.current) return
    if (!enableAllowed) return

    busyRef.current = true
    setBusy(true)
    const toastSession = createToastSession()

    try {
      const result = await enablePushSubscriptionFromUser()
      if (!result.ok) {
        toastSession.error(result.message)
        await device.refresh()
        return
      }
      toastSession.success('この端末の通知を有効にしました')
      await device.refresh()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section
      className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm"
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-busy={busy || device.status === 'loading'}
    >
      <h2 id={titleId} className="text-sm font-bold text-foreground">
        通知をオンにしてください
      </h2>
      <p id={descId} className="mt-1 text-xs leading-snug text-muted">
        学習記録のリマインダーや、新しいお知らせ・メッセージをこの端末で受け取れます。
      </p>

      <PushSetupGuidance status={device.status} showIosGuide={device.showIosGuide} />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {enableAllowed ? (
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            aria-label="この端末の通知を設定する"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
          >
            {busy ? '設定中…' : '通知を設定する'}
          </button>
        ) : (
          <Link
            href={NOTIFICATIONS_HREF}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="通知設定ページを開く"
          >
            通知設定を開く
          </Link>
        )}

        {enableAllowed && (
          <Link
            href={NOTIFICATIONS_HREF}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            通知設定を詳しく見る
          </Link>
        )}

        {(device.status === 'permission_denied' ||
          device.status === 'network_error' ||
          device.status === 'requires_standalone') && (
          <button
            type="button"
            onClick={() => void device.refresh()}
            className="text-xs font-medium text-muted underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            状態を再確認する
          </button>
        )}
      </div>
    </section>
  )
}
