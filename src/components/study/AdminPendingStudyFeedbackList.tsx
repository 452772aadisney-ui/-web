'use client'

import { useCallback, useMemo, useState } from 'react'
import { AdminStudentDailyStudyCard } from '@/components/study/AdminStudentDailyStudyCard'
import { pendingStudyDayKey } from '@/lib/study/pending-feedback'
import type { PendingStudyFeedbackItem } from '@/lib/study/feedback-queries'

type RetainedItem = PendingStudyFeedbackItem & {
  retainedAt: number
}

interface AdminPendingStudyFeedbackListProps {
  items: PendingStudyFeedbackItem[]
}

/**
 * Keeps draft comments across sibling saves / RSC refresh, and retains
 * locally completed cards so an in-progress comment is not lost when the
 * day drops out of the server pending list after a successful stamp save.
 */
export function AdminPendingStudyFeedbackList({
  items,
}: AdminPendingStudyFeedbackListProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [retained, setRetained] = useState<RetainedItem[]>([])

  const serverKeys = useMemo(
    () => new Set(items.map((item) => pendingStudyDayKey(item.student.id, item.studiedOn))),
    [items],
  )

  const retainedVisible = useMemo(
    () =>
      retained
        .filter((item) => !serverKeys.has(pendingStudyDayKey(item.student.id, item.studiedOn)))
        .sort((a, b) => b.retainedAt - a.retainedAt),
    [retained, serverKeys],
  )

  const displayItems = useMemo(
    () => [...items, ...retainedVisible],
    [items, retainedVisible],
  )

  const handleCommentChange = useCallback((key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSaveSuccess = useCallback((item: PendingStudyFeedbackItem) => {
    const key = pendingStudyDayKey(item.student.id, item.studiedOn)
    setRetained((prev) => {
      const without = prev.filter(
        (row) => pendingStudyDayKey(row.student.id, row.studiedOn) !== key,
      )
      return [
        ...without,
        {
          ...item,
          retainedAt: Date.now(),
        },
      ]
    })
  }, [])

  const handleDismiss = useCallback((key: string) => {
    setRetained((prev) =>
      prev.filter((row) => pendingStudyDayKey(row.student.id, row.studiedOn) !== key),
    )
    setDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  if (displayItems.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        条件に合う未対応の学習記録はありません。
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {displayItems.map((item) => {
        const key = pendingStudyDayKey(item.student.id, item.studiedOn)
        const isRetained = !serverKeys.has(key)
        const commentValue =
          key in drafts ? drafts[key]! : (item.feedback?.comment ?? '')

        return (
          <div key={key} className="space-y-2">
            {isRetained && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p>対応済みです。入力中のコメントがあれば続けて保存できます。</p>
                <button
                  type="button"
                  onClick={() => handleDismiss(key)}
                  className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                >
                  一覧から外す
                </button>
              </div>
            )}
            <AdminStudentDailyStudyCard
              summary={item}
              studiedOn={item.studiedOn}
              variant="pending"
              commentValue={commentValue}
              onCommentChange={(value) => handleCommentChange(key, value)}
              onSaveSuccess={(saved) =>
                handleSaveSuccess({
                  ...item,
                  feedback: saved.feedback,
                })
              }
              dailyHref={`/admin/study-daily?date=${item.studiedOn}`}
            />
          </div>
        )
      })}
    </div>
  )
}
