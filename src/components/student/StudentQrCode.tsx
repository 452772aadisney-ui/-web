'use client'

import { useEffect, useId, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface StudentQrCodeProps {
  studentCode: string
}

export function StudentQrCode({ studentCode }: StudentQrCodeProps) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0 rounded-xl border border-border bg-white p-2">
          <QRCodeSVG
            value={studentCode}
            size={72}
            level="M"
            includeMargin
            className="h-[72px] w-[72px]"
            aria-label={`生徒ID ${studentCode} のQRコード（プレビュー）`}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">生徒ID</p>
          <p className="mt-1 truncate font-mono text-xl font-bold tracking-wide sm:text-2xl">
            {studentCode}
          </p>
          <p className="mt-1 text-xs text-muted">塾・教室での出席確認などにご利用ください</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-card"
      >
        QRコードを大きく表示
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(100dvh-2rem,40rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-lg font-bold">
                  生徒ID（QRコード）
                </h2>
                <p className="mt-1 font-mono text-base font-bold tracking-wide">{studentCode}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
              >
                閉じる
              </button>
            </div>

            <div className="mt-5 flex justify-center rounded-xl border border-border bg-white p-4">
              <QRCodeSVG
                value={studentCode}
                size={280}
                level="M"
                includeMargin
                className="h-auto w-full max-w-[280px]"
                aria-label={`生徒ID ${studentCode} のQRコード`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
