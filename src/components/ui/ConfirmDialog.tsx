'use client'

import { useEffect, useId, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible confirm dialog using the native dialog element.
 * Prefer over window.confirm for destructive actions.
 *
 * Native `<dialog showModal>` provides focus trap + focus restore.
 * Initial focus is forced onto Cancel (safer default for destructive confirms).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      // Prefer Cancel over Confirm for destructive dialogs.
      cancelRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onCancel}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-base font-bold">
          {title}
        </h2>
        <p id={descId} className="text-sm text-muted whitespace-pre-wrap">
          {description}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-card disabled:opacity-60"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
