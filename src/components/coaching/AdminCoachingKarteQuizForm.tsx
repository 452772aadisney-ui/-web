'use client'

import { useActionState } from 'react'
import { registerStudentQuizzes, type QuizActionState } from '@/app/quizzes/actions'
import { useActionToast } from '@/hooks/useActionToast'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { getTodayDateKey } from '@/lib/study/dates'

const initialState: QuizActionState = {}
const fieldClass =
  'block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface AdminCoachingKarteQuizFormProps {
  studentId: string
}

export function AdminCoachingKarteQuizForm({ studentId }: AdminCoachingKarteQuizFormProps) {
  const [state, formAction, pending] = useActionState(registerStudentQuizzes, initialState)

  useActionToast(state, {
    successMessage: '小テストを登録しました',
    pending,
  })

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-bold">小テストの登録</h3>
      <p className="mt-1 text-xs text-muted">
        この生徒向けの小テストを登録します。Googleカレンダーにも反映されます。
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="targetStudentIds" value={studentId} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required className={fieldClass} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">教科</span>
            <select name="subject" defaultValue="" className={fieldClass}>
              <option value="">—</option>
              {EXAM_SUBJECTS.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">満点 *</span>
            <input
              type="number"
              name="maxScore"
              min={1}
              step={1}
              required
              defaultValue={100}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">実施日 *</span>
          <input
            type="date"
            name="scheduledOn"
            required
            defaultValue={getTodayDateKey()}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">説明</span>
          <input name="description" className={fieldClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">メモ</span>
          <input name="note" className={fieldClass} />
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '登録中…' : '小テストを登録'}
        </button>
      </form>
    </section>
  )
}
