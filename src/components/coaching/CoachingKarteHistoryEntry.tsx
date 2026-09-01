'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteCoachingKarteEntry,
  updateCoachingKarteEntry,
  type CoachingActionState,
} from '@/app/coaching/actions'
import type { CoachingCoach, CoachingKarteEntryWithDetails } from '@/types/coaching'
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea'
import { getPersonName } from '@/lib/auth/display-name'

const initialState: CoachingActionState = {}
const fieldClass =
  'block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface CoachingKarteHistoryEntryProps {
  entry: CoachingKarteEntryWithDetails
  coaches: CoachingCoach[]
  tableAvailable?: boolean
}

export function CoachingKarteHistoryEntry({
  entry,
  coaches,
  tableAvailable = true,
}: CoachingKarteHistoryEntryProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [updateState, updateAction, updatePending] = useActionState(
    updateCoachingKarteEntry,
    initialState,
  )
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCoachingKarteEntry,
    initialState,
  )

  useEffect(() => {
    if (updateState.success) {
      setEditing(false)
      router.refresh()
    }
  }, [updateState.success, router])

  useEffect(() => {
    if (deleteState.success) {
      router.refresh()
    }
  }, [deleteState.success, router])

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-background p-4">
        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="studentId" value={entry.student_id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">面談日 *</span>
              <input
                type="date"
                name="sessionDate"
                required
                defaultValue={entry.session_date}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">担当講師</span>
              <select
                name="coachId"
                defaultValue={entry.coach_id ?? ''}
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
              defaultValue={entry.discussion_content}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">次回までの約束事</span>
            <AutoResizeTextarea
              name="nextCommitments"
              minRows={3}
              maxRows={20}
              defaultValue={entry.next_commitments}
              className={fieldClass}
            />
          </label>

          {updateState.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{updateState.error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={updatePending || !tableAvailable}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {updatePending ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              キャンセル
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-medium text-foreground">{entry.session_date}</span>
          {entry.coach?.name && <span>担当: {entry.coach.name}</span>}
          {entry.created_by_profile && (
            <span>記録: {getPersonName(entry.created_by_profile)}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!tableAvailable}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            編集
          </button>
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (
                !window.confirm('このカルテ記録を削除しますか？この操作は取り消せません。')
              ) {
                event.preventDefault()
              }
            }}
          >
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="studentId" value={entry.student_id} />
            <button
              type="submit"
              disabled={deletePending || !tableAvailable}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-error disabled:opacity-60"
            >
              {deletePending ? '削除中…' : '削除'}
            </button>
          </form>
        </div>
      </div>

      {deleteState.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{deleteState.error}</p>
      )}

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
  )
}
