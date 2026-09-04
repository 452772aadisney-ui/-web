'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { createStudyLog, type StudyLogActionState } from '@/app/study/actions'
import { useAchievementUnlockDialog } from '@/components/achievements/useAchievementUnlockDialog'
import { useActionToast } from '@/hooks/useActionToast'
import { getJstDateKey } from '@/lib/study/dates'
import { StudyDurationInput } from '@/components/study/StudyDurationInput'

const initialState: StudyLogActionState = {}

const fieldClass =
  'block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const dateFieldShellClass =
  'w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'

interface StudyLogTextbookFormProps {
  textbookId: string
  textbookName: string
  subject: string
  pickHref?: string
}

export function StudyLogTextbookForm({
  textbookId,
  textbookName,
  subject,
  pickHref = '/dashboard/study/textbook',
}: StudyLogTextbookFormProps) {
  const [state, formAction, pending] = useActionState(createStudyLog, initialState)
  const { dialog: achievementDialog } = useAchievementUnlockDialog(state.unlockedAchievements)
  const todayKey = getJstDateKey()

  useActionToast(state, {
    successMessage: '学習記録を追加しました',
    pending,
  })

  return (
    <>
      {achievementDialog}
      <form action={formAction} className="min-w-0 space-y-4">
        <input type="hidden" name="registrationMode" value="textbook" />
        <input type="hidden" name="textbookId" value={textbookId} />
        <input type="hidden" name="subject" value={subject} />

        <div className="rounded-xl border border-border bg-background px-4 py-3">
          <p className="text-xs font-medium text-muted">選択中の参考書</p>
          <p className="mt-1 font-bold">{textbookName}</p>
          <p className="mt-1 text-sm text-muted">科目: {subject}</p>
          <Link
            href={pickHref}
            className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
          >
            参考書を選び直す
          </Link>
        </div>

        <label className="block w-full min-w-0">
          <span className="mb-1.5 block text-sm font-medium">
            学習日 <span className="text-error">*</span>
          </span>
          <div className={dateFieldShellClass}>
            <input
              type="date"
              name="studiedOn"
              defaultValue={todayKey}
              max={todayKey}
              required
              className="study-date-input px-3 py-2.5 outline-none"
            />
          </div>
        </label>

        <label className="block w-full min-w-0">
          <span className="mb-1.5 block text-sm font-medium">内容</span>
          <textarea
            name="content"
            rows={3}
            placeholder="例: 第3章 二次関数の演習"
            className={fieldClass}
          />
        </label>

        <StudyDurationInput />

        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? '保存中…' : '記録を追加'}
        </button>
      </form>
    </>
  )
}
