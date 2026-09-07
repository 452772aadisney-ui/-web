'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { DeviceNotificationSnapshot } from '@/hooks/useDeviceNotificationStatus'
import { enablePushSubscriptionFromUser } from '@/lib/push/client'
import {
  canEnablePushFromPrompt,
  shouldShowPushRecommendedItem,
} from '@/lib/push/setup-prompt'
import { createToastSession } from '@/lib/toast/app-toast'

const NOTIFICATIONS_HREF = '/dashboard/notifications'

type Props = {
  anyCategoryEnabled: boolean
  device: DeviceNotificationSnapshot
}

/**
 * Device-local recommended onboarding row (not stored in account checklist DB).
 */
export function StudentPushRecommendedItem({ anyCategoryEnabled, device }: Props) {
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  if (
    !shouldShowPushRecommendedItem({
      status: device.status,
      anyCategoryEnabled,
    })
  ) {
    return null
  }

  const completed = device.status === 'subscribed'
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

  const mark = (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        completed
          ? 'bg-emerald-100 text-emerald-700'
          : 'border border-border text-muted'
      }`}
      aria-hidden
    >
      {completed ? '✓' : ''}
    </span>
  )

  return (
    <li className="list-none">
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-sm"
        aria-busy={busy}
      >
        {mark}
        <div className="min-w-0 flex-1">
          <p
            className={
              completed ? 'text-muted line-through' : 'font-medium text-foreground'
            }
          >
            通知を設定する（推奨）
          </p>
          <p className="text-[11px] text-muted">この端末のみ・必須ではありません</p>
        </div>
        {!completed &&
          (enableAllowed ? (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={busy}
              aria-label="この端末の通知を設定する"
              className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {busy ? '設定中…' : '設定する'}
            </button>
          ) : (
            <Link
              href={NOTIFICATIONS_HREF}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="通知設定ページを開く"
            >
              案内を見る
            </Link>
          ))}
      </div>
    </li>
  )
}
