'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

interface ActionToastState {
  success?: boolean
  error?: string
}

interface UseActionToastOptions {
  successMessage?: string
  errorMessage?: string
}

export function useActionToast(
  state: ActionToastState,
  { successMessage = '保存しました', errorMessage }: UseActionToastOptions = {},
) {
  const handledSuccess = useRef(false)
  const lastError = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!state.success) {
      handledSuccess.current = false
      return
    }

    if (handledSuccess.current) return

    handledSuccess.current = true
    toast.success(successMessage)
  }, [state.success, successMessage])

  useEffect(() => {
    if (!state.error) return
    if (state.error === lastError.current) return

    lastError.current = state.error
    toast.error(errorMessage ?? state.error)
  }, [state.error, errorMessage])
}
