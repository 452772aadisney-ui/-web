'use client'

import { useEffect, useId, useRef } from 'react'
import {
  APP_TOAST_SAFE_ERROR_MESSAGE,
  createToastSession,
  type AppToastSession,
} from '@/lib/toast/app-toast'

interface ActionToastState {
  success?: boolean
  error?: string
}

interface UseActionToastOptions {
  successMessage?: string
  /** Safe user-facing error for the toast only (details stay on the form). */
  errorMessage?: string
  /** Pass useActionState pending so each submit can re-show toasts */
  pending?: boolean
  /** Stable id prefix to prevent duplicate stacked toasts */
  toastId?: string
}

/**
 * Shows success/error toasts from Server Action state after each submission.
 * Uses the shared toast session so route changes cancel late notifications.
 */
export function useActionToast(
  state: ActionToastState,
  {
    successMessage = '保存しました',
    errorMessage = APP_TOAST_SAFE_ERROR_MESSAGE,
    pending = false,
    toastId,
  }: UseActionToastOptions = {},
) {
  const reactId = useId()
  const idPrefix = toastId ?? reactId
  const submissionStarted = useRef(false)
  const sessionRef = useRef<AppToastSession>(createToastSession())

  useEffect(() => {
    if (pending) {
      submissionStarted.current = true
      sessionRef.current = createToastSession()
      return
    }

    if (!submissionStarted.current) return
    submissionStarted.current = false

    const session = sessionRef.current

    if (state.success) {
      session.success(successMessage, `${idPrefix}-success`)
      return
    }

    if (state.error) {
      session.error(errorMessage, `${idPrefix}-error`)
    }
  }, [pending, state.success, state.error, successMessage, errorMessage, idPrefix])
}
