'use client'

import { QRCodeSVG } from 'qrcode.react'

interface StudentQrCodeProps {
  studentCode: string
}

export function StudentQrCode({ studentCode }: StudentQrCodeProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="w-full rounded-xl border border-border bg-white p-3 sm:p-4">
        <QRCodeSVG
          value={studentCode}
          size={512}
          level="M"
          includeMargin
          className="h-auto w-full"
          aria-label={`生徒ID ${studentCode} のQRコード`}
        />
      </div>
      <div className="text-center">
        <p className="text-sm text-muted">生徒ID</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-wide sm:text-3xl">{studentCode}</p>
        <p className="mt-2 text-xs text-muted sm:text-sm">
          塾・教室での出席確認などにご利用ください
        </p>
      </div>
    </div>
  )
}
