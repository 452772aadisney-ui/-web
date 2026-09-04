'use client'

import { useActionState } from 'react'
import {
  upsertStudyDayFeedback,
  type StudyDailyFeedbackActionState,
} from '@/app/admin/study-daily/actions'
import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { formatDuration } from '@/lib/study/chart-data'
import type { StudyLog } from '@/lib/study/chart-data'
import { STUDY_FEEDBACK_STAMPS, type StudyDayFeedback } from '@/lib/study/feedback'
import { getPersonName } from '@/lib/auth/display-name'
import { useActionToast } from '@/hooks/useActionToast'
import type { StudentDailyStudySummary } from '@/lib/study/feedback-queries'

const initialState: StudyDailyFeedbackActionState = {}

interface AdminStudentDailyStudyCardProps {
  summary: StudentDailyStudySummary
  studiedOn: string
}

function formatLogSummary(log: StudyLog): string {
  const subject = resolveStudySubjectCategory(log.subject) ?? log.subject
  return `${subject} ${formatDuration(log.duration_minutes)}${log.textbook_name.trim() ? `（${log.textbook_name}）` : ''}`
}

function CompletedStudyCard({ summary }: { summary: StudentDailyStudySummary }) {
  return (
    <section className="rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{getPersonName(summary.student)}</h3>
        <p className="text-sm font-medium">合計 {formatDuration(summary.totalMinutes)}</p>
      </div>
    </section>
  )
}

export function AdminStudentDailyStudyCard({ summary, studiedOn }: AdminStudentDailyStudyCardProps) {
  const feedback = summary.feedback

  if (feedback) {
    return <CompletedStudyCard summary={summary} />
  }

  return (
    <IncompleteStudyCard summary={summary} studiedOn={studiedOn} feedback={feedback} />
  )
}

function IncompleteStudyCard({
  summary,
  studiedOn,
  feedback,
}: {
  summary: StudentDailyStudySummary
  studiedOn: string
  feedback: StudyDayFeedback | null
}) {
  const [state, formAction, pending] = useActionState(upsertStudyDayFeedback, initialState)
  const defaultStamp = feedback?.stamp ?? STUDY_FEEDBACK_STAMPS[0].id

  useActionToast(state, {
    successMessage: 'フィードバックを保存しました',
    pending,
  })

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{getPersonName(summary.student)}</h3>
          <p className="text-sm text-muted">{summary.student.email}</p>
        </div>
        <p className="text-sm font-medium">合計 {formatDuration(summary.totalMinutes)}</p>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {summary.logs.map((log) => (
          <li key={log.id} className="rounded-lg bg-background px-3 py-2">
            <span className="font-medium">{formatLogSummary(log)}</span>
            {log.content.trim() && <p className="mt-1 text-muted">{log.content}</p>}
          </li>
        ))}
      </ul>

      <form action={formAction} className="mt-6 space-y-4 border-t border-border pt-6">
        <input type="hidden" name="studentId" value={summary.student.id} />
        <input type="hidden" name="studiedOn" value={studiedOn} />

        <div>
          <p className="mb-2 text-sm font-medium">スタンプ</p>
          <div className="flex flex-wrap gap-2">
            {STUDY_FEEDBACK_STAMPS.map((stamp) => (
              <label
                key={stamp.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="stamp"
                  value={stamp.id}
                  defaultChecked={defaultStamp === stamp.id}
                  required
                  className="sr-only"
                />
                <span aria-hidden>{stamp.emoji}</span>
                {stamp.label}
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">コメント</span>
          <textarea
            name="comment"
            rows={3}
            defaultValue={feedback?.comment ?? ''}
            placeholder="その日の学習についてコメントを入力"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : 'フィードバックを送信'}
        </button>
      </form>
    </section>
  )
}
