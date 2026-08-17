'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { MYPAGE_MENU_ICONS } from '@/components/student/MyPageMenuButtons'

const optionClass =
  'flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-5 text-center transition hover:bg-card'

interface StudyLogModeDialogProps {
  open: boolean
  onClose: () => void
}

export function StudyLogModeDialog({ open, onClose }: StudyLogModeDialogProps) {
  const router = useRouter()

  if (!open) return null

  function chooseSubject() {
    router.push('/dashboard/study/subject')
  }

  function chooseTextbook() {
    router.push('/dashboard/study/textbook')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-log-mode-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="study-log-mode-title" className="text-center text-lg font-bold">
          登録方法を選ぶ
        </h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={chooseSubject} className={optionClass}>
            <Image
              src={MYPAGE_MENU_ICONS.recordStudy}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10"
              aria-hidden
            />
            <span className="text-base font-bold">教科で登録</span>
          </button>
          <button type="button" onClick={chooseTextbook} className={optionClass}>
            <Image
              src={MYPAGE_MENU_ICONS.textbookRegister}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10"
              aria-hidden
            />
            <span className="text-base font-bold">参考書で登録</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-border px-4 py-3 text-sm text-muted hover:bg-background"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
