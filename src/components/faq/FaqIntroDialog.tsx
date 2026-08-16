'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { MYPAGE_MENU_ICONS } from '@/components/student/MyPageMenuButtons'

interface FaqIntroDialogProps {
  open: boolean
}

export function FaqIntroDialog({ open }: FaqIntroDialogProps) {
  const [dismissed, setDismissed] = useState(false)

  if (!open || dismissed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-intro-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <Image
            src={MYPAGE_MENU_ICONS.faq}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12"
            aria-hidden
          />
          <h2 id="faq-intro-title" className="mt-4 text-lg font-bold">
            まずはFAQをご確認ください
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            アカウント登録ありがとうございます。アプリの使い方やできることを「FAQ（よくある質問）」にまとめています。最初にご確認ください。
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/dashboard/faq"
            className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white hover:bg-primary-hover"
          >
            FAQを開く
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-border px-4 py-3 text-sm text-muted hover:bg-background"
          >
            後で確認する
          </button>
        </div>
      </div>
    </div>
  )
}
