'use client'

import { QRCodeSVG } from 'qrcode.react'

interface StudentQrCodeProps {
  studentCode: string
}

export function StudentQrCode({ studentCode }: StudentQrCodeProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-xl border border-border bg-white p-4">
        <QRCodeSVG
          value={studentCode}
          size={180}
          level="M"
          includeMargin
          aria-label={`生徒ID ${studentCode} のQRコード`}
        />
      </div>
      <div className="text-center">
        <p className="text-sm text-muted">生徒ID</p>
        <p className="mt-1 font-mono text-lg font-bold tracking-wide">{studentCode}</p>
        <p className="mt-2 text-xs text-muted">
          塾・教室での出席確認などにご利用ください
        </p>
      </div>
    </div>
  )
}
