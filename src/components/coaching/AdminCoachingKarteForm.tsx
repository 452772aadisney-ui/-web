'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCoachingKarteEntry,
  type CoachingActionState,
} from '@/app/coaching/actions'
import type { CoachingCoach, CoachingKarteEntryWithDetails } from '@/types/coaching'
import { getPersonName } from '@/lib/auth/display-name'

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
  tableAvailable?: boolean
}

export function AdminCoachingKarteForm({
  studentId,
  defaultSessionDate,
  defaultCoachId,
  defaultBookingId,
  coaches,
  history,
  tableAvailable = true,
}: AdminCoachingKarteFormProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createCoachingKarteEntry, initialState)

  useEffect(() => {
    if (state.success) {
      router.refresh()
    }
  }, [state.success, router])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold">今回のコーチング内容</h2>
        <form key={history[0]?.id ?? 'empty'} action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="studentId" value={studentId} />
          {defaultBookingId && (
            <input type="hidden" name="bookingId" value={defaultBookingId} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">面談日 *</span>
              <input
                type="date"
                name="sessionDate"
                required
                defaultValue={defaultSessionDate}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">担当講師</span>
              <select
                name="coachId"
                defaultValue={defaultCoachId ?? ''}
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
            <textarea
              name="discussionContent"
              rows={6}
              required
              placeholder="面談で話した内容を記録"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">次回までの約束事</span>
            <textarea
              name="nextCommitments"
              rows={4}
              placeholder="生徒との約束・宿題・次回確認事項など"
              className={fieldClass}
            />
          </label>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{state.error}</p>
          )}
          {state.success && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              カルテを保存しました
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !tableAvailable}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : 'カルテを保存'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-bold">前回までの記録</h2>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-muted">まだカルテの記録がありません。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-foreground">{entry.session_date}</span>
                  {entry.coach?.name && <span>担当: {entry.coach.name}</span>}
                  {entry.created_by_profile && (
                    <span>記録: {getPersonName(entry.created_by_profile)}</span>
                  )}
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted">話した内容</p>
                    <p className="mt-1 whitespace-pre-wrap">{entry.discussion_content}</p>
                  </div>
                  {entry.next_commitments.trim() && (
                    <div>
                      <p className="text-xs font-medium text-muted">次回までの約束事</p>
                      <p className="mt-1 whitespace-pre-wrap">{entry.next_commitments}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
