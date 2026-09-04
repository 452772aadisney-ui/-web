'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCoachingKarteEntry,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachingKarteHistoryEntry } from '@/components/coaching/CoachingKarteHistoryEntry'
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea'
import { Pagination } from '@/components/ui/Pagination'
import { useActionToast } from '@/hooks/useActionToast'
import {
  clearKarteDraft,
  loadKarteDraft,
  saveKarteDraft,
} from '@/lib/coaching/karte-draft'
import type { CoachingCoach, CoachingKarteEntryWithDetails } from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface AdminCoachingKarteFormProps {
  studentId: string
  defaultSessionDate: string
  defaultCoachId?: string | null
  defaultBookingId?: string | null
  coaches: CoachingCoach[]
  history: CoachingKarteEntryWithDetails[]
  historyTotalCount: number
  historyPage: number
  historyPageSize: number
  tableAvailable?: boolean
}

export function AdminCoachingKarteForm({
  studentId,
  defaultSessionDate,
  defaultCoachId,
  defaultBookingId,
  coaches,
  history,
  historyTotalCount,
  historyPage,
  historyPageSize,
  tableAvailable = true,
}: AdminCoachingKarteFormProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createCoachingKarteEntry, initialState)
  const [sessionDate, setSessionDate] = useState(defaultSessionDate)
  const [coachId, setCoachId] = useState(defaultCoachId ?? '')
  const [discussionContent, setDiscussionContent] = useState('')
  const [nextCommitments, setNextCommitments] = useState('')
  const [bookingId, setBookingId] = useState(defaultBookingId ?? '')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  useActionToast(state, {
    successMessage: 'カルテを保存しました',
  })

  useEffect(() => {
    const draft = loadKarteDraft(studentId)
    if (draft) {
      setSessionDate(draft.sessionDate)
      setCoachId(draft.coachId)
      setDiscussionContent(draft.discussionContent)
      setNextCommitments(draft.nextCommitments)
      if (draft.bookingId) setBookingId(draft.bookingId)
      setDraftLoaded(true)
    }
  }, [studentId])

  useEffect(() => {
    if (state.success) {
      clearKarteDraft(studentId)
      setSessionDate(defaultSessionDate)
      setCoachId(defaultCoachId ?? '')
      setDiscussionContent('')
      setNextCommitments('')
      setBookingId(defaultBookingId ?? '')
      setDraftSaved(false)
      setDraftLoaded(false)
      router.refresh()
    }
  }, [
    state.success,
    router,
    studentId,
    defaultSessionDate,
    defaultCoachId,
    defaultBookingId,
  ])

  function handleDraftSave() {
    saveKarteDraft(studentId, {
      sessionDate,
      coachId,
      discussionContent,
      nextCommitments,
      bookingId,
    })
    setDraftSaved(true)
    setDraftLoaded(false)
  }

  const historyPathname = `/admin/coaching/karte/${studentId}`

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold">今回のコーチング内容</h2>
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="studentId" value={studentId} />
          {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">面談日 *</span>
              <input
                type="date"
                name="sessionDate"
                required
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">担当講師</span>
              <select
                name="coachId"
                value={coachId}
                onChange={(event) => setCoachId(event.target.value)}
                className={fieldClass}
              >
                <option value="">未選択</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">話した内容 *</span>
            <AutoResizeTextarea
              name="discussionContent"
              minRows={4}
              maxRows={20}
              required
              value={discussionContent}
              onChange={(event) => setDiscussionContent(event.target.value)}
              placeholder="面談で話した内容を記録"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">次回までの約束事</span>
            <AutoResizeTextarea
              name="nextCommitments"
              minRows={3}
              maxRows={20}
              value={nextCommitments}
              onChange={(event) => setNextCommitments(event.target.value)}
              placeholder="生徒との約束・宿題・次回確認事項など"
              className={fieldClass}
            />
          </label>

          {draftLoaded && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              前回の一時保存内容を復元しました
            </p>
          )}
          {draftSaved && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              一時保存しました
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !tableAvailable}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? '保存中…' : 'カルテを保存'}
            </button>
            <button
              type="button"
              onClick={handleDraftSave}
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium"
            >
              一時保存
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold">前回までの記録</h2>
        {historyTotalCount === 0 ? (
          <p className="mt-4 text-sm text-muted">まだカルテの記録がありません。</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {history.map((entry) => (
                <CoachingKarteHistoryEntry
                  key={entry.id}
                  entry={entry}
                  coaches={coaches}
                  tableAvailable={tableAvailable}
                />
              ))}
            </ul>
            <Pagination
              currentPage={historyPage}
              totalCount={historyTotalCount}
              pageSize={historyPageSize}
              pageParam="historyPage"
              pathname={historyPathname}
              preserveParams={{
                booking: defaultBookingId ?? undefined,
                coach: defaultCoachId ?? undefined,
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
