'use client'

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import {
  upsertStudyDayFeedback,
  type StudyDailyFeedbackActionState,
} from '@/app/admin/study-daily/actions'
import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { formatDuration } from '@/lib/study/chart-data'
import type { StudyLog } from '@/lib/study/chart-data'
import {
  STUDY_FEEDBACK_STAMPS,
  type StudyDayFeedback,
  type StudyFeedbackStampId,
  isStudyFeedbackStampId,
  getStudyFeedbackStamp,
} from '@/lib/study/feedback'
import { getPersonName } from '@/lib/auth/display-name'
import { useActionToast } from '@/hooks/useActionToast'
import type { StudentDailyStudySummary } from '@/lib/study/feedback-queries'
import { formatStudyDateLabel, getJstDateKey } from '@/lib/study/dates'

const initialState: StudyDailyFeedbackActionState = {}

export type AdminStudentDailyStudyCardSaveResult = {
  stamp: StudyFeedbackStampId
  comment: string
  feedback: StudyDayFeedback
}

interface AdminStudentDailyStudyCardProps {
  summary: StudentDailyStudySummary
  studiedOn: string
  /** daily: collapse completed cards. pending: always show editable form. */
  variant?: 'daily' | 'pending'
  commentValue?: string
  stampValue?: string
  onCommentChange?: (value: string) => void
  onStampChange?: (value: StudyFeedbackStampId) => void
  onSaveSuccess?: (result: AdminStudentDailyStudyCardSaveResult) => void
  dailyHref?: string
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

export function AdminStudentDailyStudyCard({
  summary,
  studiedOn,
  variant = 'daily',
  commentValue,
  stampValue,
  onCommentChange,
  onStampChange,
  onSaveSuccess,
  dailyHref,
}: AdminStudentDailyStudyCardProps) {
  const feedback = summary.feedback

  if (variant === 'daily' && feedback) {
    return <CompletedStudyCard summary={summary} />
  }

  return (
    <StudyFeedbackFormCard
      summary={summary}
      studiedOn={studiedOn}
      feedback={feedback}
      variant={variant}
      commentValue={commentValue}
      stampValue={stampValue}
      onCommentChange={onCommentChange}
      onStampChange={onStampChange}
      onSaveSuccess={onSaveSuccess}
      dailyHref={dailyHref}
    />
  )
}

function StudyFeedbackFormCard({
  summary,
  studiedOn,
  feedback,
  variant,
  commentValue,
  stampValue,
  onCommentChange,
  onStampChange,
  onSaveSuccess,
  dailyHref,
}: {
  summary: StudentDailyStudySummary
  studiedOn: string
  feedback: StudyDayFeedback | null
  variant: 'daily' | 'pending'
  commentValue?: string
  stampValue?: string
  onCommentChange?: (value: string) => void
  onStampChange?: (value: StudyFeedbackStampId) => void
  onSaveSuccess?: (result: AdminStudentDailyStudyCardSaveResult) => void
  dailyHref?: string
}) {
  const [state, formAction, pending] = useActionState(upsertStudyDayFeedback, initialState)
  const todayKey = getJstDateKey()
  const formRef = useRef<HTMLFormElement>(null)
  const submissionStarted = useRef(false)
  /** Baseline for expected version only — never auto-adopted from conflict payload. */
  const [baselineOverride, setBaselineOverride] = useState<StudyDayFeedback | null>(null)
  const [conflictPreview, setConflictPreview] = useState<StudyDayFeedback | null>(null)
  const [previewAdoptedNotice, setPreviewAdoptedNotice] = useState(false)

  const baseline = baselineOverride ?? feedback
  const defaultStamp = baseline?.stamp ?? STUDY_FEEDBACK_STAMPS[0].id

  const controlledComment = onCommentChange != null
  const controlledStamp = onStampChange != null
  const selectedStamp =
    controlledStamp && stampValue && isStudyFeedbackStampId(stampValue)
      ? stampValue
      : defaultStamp

  const expectedFeedbackId =
    baseline?.id && !baseline.id.startsWith('local-') ? baseline.id : ''
  // Pass DB string through unchanged (no Date re-serialize).
  const expectedUpdatedAt = expectedFeedbackId ? (baseline?.updated_at ?? '') : ''

  const historyHref = dailyHref ?? `/admin/study-daily?date=${studiedOn}`

  useActionToast(state, {
    successMessage: 'フィードバックを保存しました',
    pending,
    showSuccess: !state.conflict,
  })

  useEffect(() => {
    if (pending) {
      submissionStarted.current = true
      return
    }
    if (!submissionStarted.current) return
    submissionStarted.current = false

    if (state.conflict) {
      if (state.latestFeedback) {
        setConflictPreview(state.latestFeedback)
      }
      setPreviewAdoptedNotice(false)
      return
    }

    if (!state.success || !onSaveSuccess) return
    if (!state.feedbackId || !state.updatedAt) return
    if (!state.stamp || !isStudyFeedbackStampId(state.stamp)) return

    const savedComment = state.comment ?? ''
    const saved: StudyDayFeedback = {
      id: state.feedbackId,
      student_id: summary.student.id,
      studied_on: studiedOn,
      stamp: state.stamp,
      comment: savedComment,
      admin_id: baseline?.admin_id ?? '',
      created_at: baseline?.created_at ?? state.updatedAt,
      updated_at: state.updatedAt,
    }

    setBaselineOverride(saved)
    setConflictPreview(null)
    setPreviewAdoptedNotice(false)
    onSaveSuccess({
      stamp: state.stamp,
      comment: savedComment,
      feedback: saved,
    })
  }, [
    state.success,
    state.conflict,
    state.feedbackId,
    state.updatedAt,
    state.stamp,
    state.comment,
    state.latestFeedback,
    pending,
    onSaveSuccess,
    summary.student.id,
    studiedOn,
    baseline?.admin_id,
    baseline?.created_at,
  ])

  const textareaValue = controlledComment ? (commentValue ?? '') : undefined

  function adoptConflictPreviewAsBaseline() {
    if (!conflictPreview) return
    setBaselineOverride(conflictPreview)
    setPreviewAdoptedNotice(true)
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{getPersonName(summary.student)}</h3>
          {variant === 'pending' ? (
            <p className="mt-1 text-sm font-medium text-foreground">
              {formatStudyDateLabel(studiedOn, todayKey)}
              <span className="ml-2 font-normal text-muted">{studiedOn}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted">{summary.student.email}</p>
          <p className="mt-1 text-xs">
            <Link href={historyHref} className="text-primary hover:underline">
              元の学習記録（毎日管理）へ
            </Link>
          </p>
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

      {state.conflict && (
        <div
          className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
          role="alert"
        >
          <p>{state.error}</p>
          <p>
            <Link href={historyHref} className="font-medium text-primary hover:underline">
              毎日管理で最新内容を開く
            </Link>
          </p>
          {conflictPreview && (
            <div className="rounded-md border border-amber-200 bg-white/80 px-3 py-2">
              <p className="font-medium">現在保存されている内容（参照）</p>
              <p className="mt-1">
                スタンプ:{' '}
                {getStudyFeedbackStamp(conflictPreview.stamp)?.label ?? conflictPreview.stamp}
              </p>
              <p className="mt-1 whitespace-pre-wrap">
                コメント: {conflictPreview.comment.trim() || '（なし）'}
              </p>
              <button
                type="button"
                onClick={adoptConflictPreviewAsBaseline}
                className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
              >
                この内容を確認したので、これを前提に再編集する
              </button>
              {previewAdoptedNotice && (
                <p className="mt-2 text-xs text-amber-900">
                  前提バージョンを更新しました。入力中のスタンプ・コメントはそのままです。内容を整えて再保存してください。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-6 space-y-4 border-t border-border pt-6">
        <input type="hidden" name="studentId" value={summary.student.id} />
        <input type="hidden" name="studiedOn" value={studiedOn} />
        <input type="hidden" name="expectedFeedbackId" value={expectedFeedbackId} />
        <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />

        <div>
          <p className="mb-2 text-sm font-medium">スタンプ</p>
          <div className="flex flex-wrap gap-2">
            {STUDY_FEEDBACK_STAMPS.map((stampOption) => (
              <label
                key={stampOption.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="stamp"
                  value={stampOption.id}
                  required
                  className="sr-only"
                  {...(controlledStamp
                    ? {
                        checked: selectedStamp === stampOption.id,
                        onChange: () => onStampChange?.(stampOption.id),
                      }
                    : { defaultChecked: defaultStamp === stampOption.id })}
                />
                <span aria-hidden>{stampOption.emoji}</span>
                {stampOption.label}
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">コメント</span>
          <textarea
            name="comment"
            rows={3}
            {...(controlledComment
              ? {
                  value: textareaValue,
                  onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
                    onCommentChange?.(event.target.value),
                }
              : { defaultValue: baseline?.comment ?? '' })}
            placeholder="その日の学習についてコメントを入力"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        {state.error && !state.conflict && (
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
