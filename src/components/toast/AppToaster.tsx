'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import {
  APP_TOAST_DURATION_MS,
  invalidateToastsOnNavigation,
} from '@/lib/toast/app-toast'

/**
 * Global toast host. Duration, close button, and route-dismiss are owned here —
 * callers must not override them per screen.
 *
 * Pathname changes dismiss all toasts immediately and invalidate in-flight sessions
 * so late async completions cannot re-show a previous page's toast.
 */
export function AppToaster() {
  const pathname = usePathname()
  const isFirstPath = useRef(true)

  useEffect(() => {
    if (isFirstPath.current) {
      isFirstPath.current = false
      return
    }
    invalidateToastsOnNavigation()
  }, [pathname])

  return (
    <Toaster
      position="top-right"
      richColors
      closeButton={false}
      duration={APP_TOAST_DURATION_MS}
      visibleToasts={3}
      expand={false}
      offset={{ top: '8rem', right: '1rem' }}
      mobileOffset={{ top: '8rem', right: '0.75rem', left: '0.75rem' }}
      swipeDirections={[]}
      containerAriaLabel="通知"
      toastOptions={{
        duration: APP_TOAST_DURATION_MS,
        closeButton: false,
        classNames: {
          toast: 'app-toast max-w-[min(24rem,calc(100vw-1.5rem))] pointer-events-none',
        },
      }}
    />
  )
}
