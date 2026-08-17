import Link from 'next/link'
import { MYPAGE_MENU_ICONS } from '@/components/student/MyPageMenuButtons'

const chooserClass =
  'flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-sm transition hover:bg-background'

export function StudyLogModeChooser() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/dashboard/study/subject" className={chooserClass}>
        <span className="text-base font-bold">教科で登録</span>
        <span className="text-xs text-muted">14科目から選んで記録します</span>
      </Link>
      <Link href="/dashboard/study/textbook" className={chooserClass}>
        <span className="text-base font-bold">参考書で登録</span>
        <span className="text-xs text-muted">登録済みの参考書から選んで記録します</span>
      </Link>
    </div>
  )
}

export function StudyLogModeChooserWithIcons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/dashboard/study/subject" className={chooserClass}>
        <img src={MYPAGE_MENU_ICONS.recordStudy} alt="" className="h-10 w-10" aria-hidden />
        <span className="text-base font-bold">教科で登録</span>
        <span className="text-xs text-muted">14科目から選んで記録します</span>
      </Link>
      <Link href="/dashboard/study/textbook" className={chooserClass}>
        <img src={MYPAGE_MENU_ICONS.textbookRegister} alt="" className="h-10 w-10" aria-hidden />
        <span className="text-base font-bold">参考書で登録</span>
        <span className="text-xs text-muted">登録済みの参考書から選んで記録します</span>
      </Link>
    </div>
  )
}
