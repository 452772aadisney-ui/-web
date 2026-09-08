'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

type AppDialogProps = {
  open: boolean
  title: string
  description?: string
  /** When true, Escape / backdrop close are ignored. */
  busy?: boolean
  onClose: () => void
  children: ReactNode
  /** Optional footer rendered below the scrollable body. */
  footer?: ReactNode
  className?: string
  /** Initial focus target; defaults to the close button. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * Accessible modal using native `<dialog showModal>` (focus trap + restore).
 * Prefer for form / preview overlays. Use ConfirmDialog for destructive confirms.
 */
export function AppDialog({
  open,
  title,
  description,
  busy = false,
  onClose,
  children,
  footer,
  className,
  initialFocusRef,
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descId = useId()
  const busyRef = useRef(busy)
  busyRef.current = busy
  /** Ignore the native `close` event when we call `dialog.close()` ourselves. */
  const ignoreCloseEventRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.showModal()
      }
      const focusTarget = initialFocusRef?.current ?? closeRef.current
      focusTarget?.focus()
    } else if (dialog.open) {
      ignoreCloseEventRef.current = true
      dialog.close()
      ignoreCloseEventRef.current = false
    }

    return () => {
      if (!dialog.open) return
      // Unmount while open: close without notifying React (parent already tearing down).
      ignoreCloseEventRef.current = true
      try {
        dialog.close()
      } catch {
        // Element may already be detached.
      }
      ignoreCloseEventRef.current = false
    }
  }, [open, initialFocusRef])

  function requestClose() {
    if (busyRef.current) return
    onCloseRef.current()
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={
        className ??
        'w-[min(36rem,calc(100vw-2rem))] max-h-[min(90vh,48rem)] overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40'
      }
      onClose={() => {
        if (ignoreCloseEventRef.current) return
        requestClose()
      }}
      onCancel={(event) => {
        // Always cancel the native close so React `open` stays the source of truth.
        event.preventDefault()
        requestClose()
      }}
    >
      <div className="flex max-h-[min(90vh,48rem)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-background hover:text-foreground disabled:opacity-60"
            aria-label="閉じる"
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
        )}
      </div>
    </dialog>
  )
}
