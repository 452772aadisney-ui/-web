'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import {
  createCoachingCoach,
  deleteCoachingCoach,
  updateCoachingCoach,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachProfileDisplay } from '@/components/coaching/CoachProfileDisplay'
import { CoachProfileFields } from '@/components/coaching/CoachProfileFields'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useActionToast } from '@/hooks/useActionToast'
import { getCoachProfileBadges } from '@/lib/coaching/coach-profile'
import type { CoachingCoach } from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function CoachForm({
  coach,
  onCancel,
  onDeleted,
}: {
  coach?: CoachingCoach
  onCancel?: () => void
  onDeleted?: () => void
}) {
  const action = coach ? updateCoachingCoach : createCoachingCoach
  const [state, formAction, pending] = useActionState(action, initialState)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePending, startDeleteTransition] = useTransition()

  useActionToast(state, {
    successMessage: coach ? '講師プロフィールを更新しました' : '講師プロフィールを追加しました',
    pending,
  })

  function handleDeleteConfirm() {
    if (!coach) return
    startDeleteTransition(async () => {
      const formData = new FormData()
      formData.set('id', coach.id)
      await deleteCoachingCoach(formData)
      setConfirmDelete(false)
      onDeleted?.()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <form action={formAction} className="space-y-3">
        {coach && <input type="hidden" name="id" value={coach.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">講師名 *</span>
            <input name="name" required defaultValue={coach?.name ?? ''} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">表示順</span>
            <input
              type="number"
              name="sortOrder"
              defaultValue={coach?.sort_order ?? 0}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-muted">生徒の担当選択画面での並び順（小さい数字ほど先）</p>
          </label>
          {coach && (
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="isActive" defaultChecked={coach.is_active} />
              予約画面に表示する
            </label>
          )}
        </div>

        <CoachProfileFields coach={coach} />

        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : coach ? '更新' : '追加'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-muted">
              キャンセル
            </button>
          )}
        </div>
      </form>

      {coach && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deletePending}
            className="text-sm text-error hover:underline disabled:opacity-60"
            aria-label={`${coach.name}を削除`}
          >
            この講師を削除
          </button>
          <ConfirmDialog
            open={confirmDelete}
            title="講師を削除しますか？"
            description={`${coach.name} を削除します。この操作は取り消せません。`}
            confirmLabel="削除する"
            busy={deletePending}
            onConfirm={handleDeleteConfirm}
            onCancel={() => {
              if (!deletePending) setConfirmDelete(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

function CoachPreviewDialog({
  coach,
  open,
  onClose,
}: {
  coach: CoachingCoach
  open: boolean
  onClose: () => void
}) {
  const titleId = useId()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-bold">
              生徒画面での表示
            </h2>
            <p className="mt-1 text-sm text-muted">{coach.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground"
            aria-label="閉じる"
          >
            閉じる
          </button>
        </div>
        <CoachProfileDisplay coach={coach} />
        {!coach.bio?.trim() && getCoachProfileBadges(coach).length === 0 && (
          <p className="mt-4 text-sm text-muted">プロフィール情報が未設定です。</p>
        )}
      </div>
    </div>
  )
}

interface AdminCoachingInstructorsManagerProps {
  coaches: CoachingCoach[]
}

export function AdminCoachingInstructorsManager({ coaches }: AdminCoachingInstructorsManagerProps) {
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null)
  const [previewCoachId, setPreviewCoachId] = useState<string | null>(null)
  const previewCoach = coaches.find((c) => c.id === previewCoachId) ?? null

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">担当講師</h2>
      <p className="mt-1 text-sm text-muted">生徒が予約時に選ぶコーチング担当者です。</p>
      <div className="mt-4 space-y-4">
        <CoachForm />
        {coaches.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {coaches.map((coach) => {
              const badges = getCoachProfileBadges(coach)
              const bio = coach.bio?.trim()

              return (
                <li key={coach.id} className="p-4">
                  {editingCoachId === coach.id ? (
                    <CoachForm
                      coach={coach}
                      onCancel={() => setEditingCoachId(null)}
                      onDeleted={() => setEditingCoachId(null)}
                    />
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{coach.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          表示順 {coach.sort_order} / {coach.is_active ? '表示中' : '非表示'}
                        </p>
                        {badges.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {badges.map((badge) => (
                              <span
                                key={badge}
                                className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        )}
                        {bio && (
                          <p className="mt-2 line-clamp-3 text-sm text-muted">{bio}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                        <button
                          type="button"
                          onClick={() => setPreviewCoachId(coach.id)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
                          aria-label={`${coach.name}講師の生徒画面での表示を確認`}
                        >
                          生徒画面での表示を確認
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCoachId(coach.id)}
                          className="text-xs text-primary hover:underline"
                          aria-label={`${coach.name}を編集`}
                        >
                          編集
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {previewCoach && (
        <CoachPreviewDialog
          coach={previewCoach}
          open={Boolean(previewCoach)}
          onClose={() => setPreviewCoachId(null)}
        />
      )}
    </section>
  )
}
