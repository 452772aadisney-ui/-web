'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminStudentDailyStudyCard } from '@/components/study/AdminStudentDailyStudyCard'
import { getPersonName } from '@/lib/auth/display-name'
import type { PendingStudyFeedbackItem } from '@/lib/study/feedback-queries'
import type { StudyFeedbackStampId } from '@/lib/study/feedback'
import {
  pendingStudyDayKey,
  retainedItemMatchesPendingFilter,
  comparePendingStudyDayOrder,
  type PendingDateFilter,
} from '@/lib/study/pending-feedback'

type RetentionReason = 'self' | 'other'

type RetainedItem = PendingStudyFeedbackItem & {
  retainedAt: number
  reason: RetentionReason
}

interface AdminPendingStudyFeedbackListProps {
  items: PendingStudyFeedbackItem[]
  filterKey: string
  dateFilter: PendingDateFilter
  query: string
}

/**
 * Keeps stamp/comment drafts across sibling saves / RSC refresh.
 * Retains resolved cards only for the active filter; self-save vs other-admin
 * completion are labeled differently so a re-fetch is not mistaken for our save.
 */
export function AdminPendingStudyFeedbackList({
  items,
  filterKey,
  dateFilter,
  query,
}: AdminPendingStudyFeedbackListProps) {
  const [draftComments, setDraftComments] = useState<Record<string, string>>({})
  const [draftStamps, setDraftStamps] = useState<Record<string, StudyFeedbackStampId>>({})
  const [retained, setRetained] = useState<RetainedItem[]>([])
  const filterKeyRef = useRef(filterKey)
  const prevItemsRef = useRef(items)

  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey
      setDraftComments({})
      setDraftStamps({})
      setRetained([])
      prevItemsRef.current = items
      return
    }

    const prev = prevItemsRef.current
    const nextKeys = new Set(
      items.map((item) => pendingStudyDayKey(item.student.id, item.studiedOn)),
    )

    const externallyGone = prev.filter((item) => {
      const key = pendingStudyDayKey(item.student.id, item.studiedOn)
      return !nextKeys.has(key)
    })

    if (externallyGone.length > 0) {
      setRetained((current) => {
        const existingKeys = new Set(
          current.map((row) => pendingStudyDayKey(row.student.id, row.studiedOn)),
        )
        const additions: RetainedItem[] = []
        for (const item of externallyGone) {
          const key = pendingStudyDayKey(item.student.id, item.studiedOn)
          if (existingKeys.has(key)) continue
          additions.push({
            ...item,
            retainedAt: Date.now(),
            reason: 'other',
          })
        }
        return additions.length > 0 ? [...current, ...additions] : current
      })
    }

    prevItemsRef.current = items
  }, [items, filterKey])

  const serverKeys = useMemo(
    () => new Set(items.map((item) => pendingStudyDayKey(item.student.id, item.studiedOn))),
    [items],
  )

  const retainedVisible = useMemo(
    () =>
      retained.filter((item) => {
        const key = pendingStudyDayKey(item.student.id, item.studiedOn)
        if (serverKeys.has(key)) return false
        return retainedItemMatchesPendingFilter(
          {
            studiedOn: item.studiedOn,
            studentName: getPersonName(item.student),
          },
          { dateFilter, query },
        )
      }),
    [retained, serverKeys, dateFilter, query],
  )

  const displayItems = useMemo(() => {
    const fromServer = items.map((item) => {
      const key = pendingStudyDayKey(item.student.id, item.studiedOn)
      const overlay = retained.find(
        (row) => pendingStudyDayKey(row.student.id, row.studiedOn) === key,
      )
      if (!overlay) return { item, retention: null as RetentionReason | null }
      return {
        item: { ...item, feedback: overlay.feedback ?? item.feedback },
        retention: overlay.reason,
      }
    })

    const extras = retainedVisible.map((item) => ({
      item,
      retention: item.reason as RetentionReason,
    }))

    const nameByStudentId = new Map<string, string>()
    for (const row of [...fromServer, ...extras]) {
      nameByStudentId.set(row.item.student.id, getPersonName(row.item.student))
    }

    // Same order as the server pending list: studied_on asc, then ja name.
    return [...fromServer, ...extras].sort((a, b) =>
      comparePendingStudyDayOrder(
        { studiedOn: a.item.studiedOn, studentId: a.item.student.id },
        { studiedOn: b.item.studiedOn, studentId: b.item.student.id },
        nameByStudentId,
      ),
    )
  }, [items, retained, retainedVisible])

  const handleCommentChange = useCallback((key: string, value: string) => {
    setDraftComments((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleStampChange = useCallback((key: string, value: StudyFeedbackStampId) => {
    setDraftStamps((prev) => ({ ...prev, [key]: value }))
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
          reason: 'self' as const,
        },
      ]
    })
  }, [])

  const handleDismiss = useCallback((key: string) => {
    setRetained((prev) =>
      prev.filter((row) => pendingStudyDayKey(row.student.id, row.studiedOn) !== key),
    )
    setDraftComments((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDraftStamps((prev) => {
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
      {displayItems.map(({ item, retention }) => {
        const key = pendingStudyDayKey(item.student.id, item.studiedOn)
        const commentValue =
          key in draftComments ? draftComments[key]! : (item.feedback?.comment ?? '')
        const stampValue =
          key in draftStamps ? draftStamps[key]! : (item.feedback?.stamp ?? undefined)

        return (
          <div key={key} className="space-y-2">
            {retention === 'self' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p>対応済み（この画面で保存済み）。コメントを追記して再保存できます。</p>
                <button
                  type="button"
                  onClick={() => handleDismiss(key)}
                  className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                >
                  一覧から外す
                </button>
              </div>
            )}
            {retention === 'other' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>
                  他の管理者により対応済みになった可能性があります。未保存の入力は残しています。上書き保存する前に毎日管理で内容を確認してください。
                </p>
                <button
                  type="button"
                  onClick={() => handleDismiss(key)}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
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
              stampValue={stampValue}
              onCommentChange={(value) => handleCommentChange(key, value)}
              onStampChange={(value) => handleStampChange(key, value)}
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
