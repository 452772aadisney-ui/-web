import { createElement } from 'react'
import { toast } from 'sonner'

/** All toasts share this duration — do not override per screen. */
export const APP_TOAST_DURATION_MS = 2000

export const APP_TOAST_SAFE_ERROR_MESSAGE =
  '保存に失敗しました。もう一度お試しください'

let toastGeneration = 0

export function getToastGeneration(): number {
  return toastGeneration
}

/** Call on App Router pathname changes to drop visible and pending toasts. */
export function invalidateToastsOnNavigation(): void {
  toastGeneration += 1
  toast.dismiss()
}

function isSessionActive(generation: number): boolean {
  return generation === toastGeneration
}

const toastBaseOptions = {
  duration: APP_TOAST_DURATION_MS,
  closeButton: false,
} as const

export function notifySuccess(message: string, id = 'app-toast-success'): void {
  toast.success(createElement('span', { role: 'status' }, message), {
    ...toastBaseOptions,
    id,
  })
}

export function notifyError(
  message: string = APP_TOAST_SAFE_ERROR_MESSAGE,
  id = 'app-toast-error',
): void {
  toast.error(createElement('span', { role: 'alert' }, message), {
    ...toastBaseOptions,
    id,
  })
}

export type AppToastSession = {
  readonly generation: number
  success: (message: string, id?: string) => void
  error: (message?: string, id?: string) => void
}

/**
 * Snapshot the current navigation generation. After a route change,
 * success/error no-ops so late async results cannot show stale toasts.
 */
export function createToastSession(): AppToastSession {
  const generation = toastGeneration

  return {
    generation,
    success(message, id) {
      if (!isSessionActive(generation)) return
      notifySuccess(message, id)
    },
    error(message = APP_TOAST_SAFE_ERROR_MESSAGE, id) {
      if (!isSessionActive(generation)) return
      notifyError(message, id)
    },
  }
}

/** @internal test helper */
export function __resetToastGenerationForTests(): void {
  toastGeneration = 0
}
