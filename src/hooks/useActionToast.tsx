'use client'

import { useEffect, useId, useRef } from 'react'
import { toast } from 'sonner'

export const ACTION_TOAST_SUCCESS_DURATION_MS = 3000
export const ACTION_TOAST_ERROR_DURATION_MS = 8000

interface ActionToastState {
  success?: boolean
  error?: string
}

interface UseActionToastOptions {
  successMessage?: string
  errorMessage?: string
  /** Pass useActionState pending so each submit can re-show toasts */
  pending?: boolean
  successDuration?: number
  errorDuration?: number
  /** Stable id prefix to prevent duplicate stacked toasts */
  toastId?: string
}

/**
 * Shows success/error toasts from Server Action state after each submission.
 * Toast lives in the root Toaster, so it survives revalidate/refresh.
 *
 * Accessibility: success uses role="status"; errors use role="alert".
 * Sonner's toaster also exposes an aria-live region.
 */
export function useActionToast(
  state: ActionToastState,
  {
    successMessage = '保存しました',
    errorMessage,
    pending = false,
    successDuration = ACTION_TOAST_SUCCESS_DURATION_MS,
    errorDuration = ACTION_TOAST_ERROR_DURATION_MS,
    toastId,
  }: UseActionToastOptions = {},
) {
  const reactId = useId()
  const idPrefix = toastId ?? reactId
  const submissionStarted = useRef(false)

  useEffect(() => {
    if (pending) {
      submissionStarted.current = true
      return
    }

    if (!submissionStarted.current) return
    submissionStarted.current = false

    if (state.success) {
      toast.success(<span role="status">{successMessage}</span>, {
        id: `${idPrefix}-success`,
        duration: successDuration,
      })
      return
    }

    if (state.error) {
      toast.error(<span role="alert">{errorMessage ?? state.error}</span>, {
        id: `${idPrefix}-error`,
        duration: errorDuration,
      })
    }
  }, [
    pending,
    state.success,
    state.error,
    successMessage,
    errorMessage,
    successDuration,
    errorDuration,
    idPrefix,
  ])
}
