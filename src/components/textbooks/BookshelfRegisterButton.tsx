'use client'

import { useState } from 'react'
import { TextbookRegisterModeDialog } from '@/components/textbooks/TextbookRegisterModeDialog'

export function BookshelfRegisterButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background"
      >
        参考書を探す / 教材を登録する
      </button>
      <TextbookRegisterModeDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
