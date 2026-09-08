'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCoachingCoach,
  deleteCoachingCoach,
  updateCoachingCoach,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachProfileDisplay } from '@/components/coaching/CoachProfileDisplay'
import { CoachProfileFields } from '@/components/coaching/CoachProfileFields'
import { AppDialog } from '@/components/ui/AppDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useActionToast } from '@/hooks/useActionToast'
import {
  getCoachAttributeTags,
  getCoachFeatureLabels,
  getCoachStrongSubjects,
  summarizeCoachText,
} from '@/lib/coaching/coach-profile'
import { createToastSession } from '@/lib/toast/app-toast'
import type { CoachingCoach } from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function CoachFormFields({
  coach,
  formId,
  pending,
}: {
  coach?: CoachingCoach
  formId: string
  pending: boolean
}) {
  return (
    <div className="space-y-3" aria-busy={pending || undefined}>
      {coach && <input type="hidden" name="id" value={coach.id} form={formId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">講師名 *</span>
          <input
            name="name"
            form={formId}
            required
            defaultValue={coach?.name ?? ''}
            disabled={pending}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">表示順</span>
          <input
            type="number"
            name="sortOrder"
            form={formId}
            defaultValue={coach?.sort_order ?? 0}
            disabled={pending}
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted">
            生徒の担当選択画面での並び順（小さい数字ほど先）
          </p>
        </label>
        {coach && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              name="isActive"
              form={formId}
              defaultChecked={coach.is_active}
              disabled={pending}
            />
            予約画面に表示する
          </label>
        )}
      </div>
      <CoachProfileFields coach={coach} />
    </div>
  )
}

function CreateCoachDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const formId = 'coach-create-form'
  const [state, formAction, pending] = useActionState(createCoachingCoach, initialState)
  const router = useRouter()
  const closedForSuccess = useRef(false)

  useActionToast(state, {
    successMessage: '講師プロフィールを追加しました',
    pending,
  })

  useEffect(() => {
    if (!open) {
      closedForSuccess.current = false
      return
    }
    if (pending || !state.success || closedForSuccess.current) return
    closedForSuccess.current = true
    onClose()
    router.refresh()
  }, [open, pending, state.success, onClose, router])

  if (!open) return null

  return (
    <AppDialog
      open={open}
      title="講師を追加"
      description="コーチング担当として生徒に表示する講師を登録します。"
      busy={pending}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-60"
          >
            キャンセル
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
            aria-busy={pending || undefined}
          >
            {pending ? '登録中…' : '登録する'}
          </button>
        </div>
      }
    >
      <form id={formId} action={formAction} className="space-y-3">
        <CoachFormFields formId={formId} pending={pending} />
        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}
      </form>
    </AppDialog>
  )
}

function EditCoachDialog({
  coach,
  open,
  onClose,
}: {
  coach: CoachingCoach
  open: boolean
  onClose: () => void
}) {
  const formId = `coach-edit-form-${coach.id}`
  const [state, formAction, pending] = useActionState(updateCoachingCoach, initialState)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePending, startDeleteTransition] = useTransition()
  const router = useRouter()
  const closedForSuccess = useRef(false)
  const busy = pending || deletePending

  useActionToast(state, {
    successMessage: '講師プロフィールを更新しました',
    pending,
  })

  useEffect(() => {
    if (!open) {
      closedForSuccess.current = false
      return
    }
    if (pending || !state.success || closedForSuccess.current) return
    closedForSuccess.current = true
    onClose()
    router.refresh()
  }, [open, pending, state.success, onClose, router])

  function handleDeleteConfirm() {
    startDeleteTransition(async () => {
      const formData = new FormData()
      formData.set('id', coach.id)
      const result = await deleteCoachingCoach(formData)
      if (result.error) {
        createToastSession().error(
          result.error,
          `coach-delete-${coach.id}`,
        )
        setConfirmDelete(false)
        return
      }
      createToastSession().success('講師を削除しました', `coach-delete-ok-${coach.id}`)
      setConfirmDelete(false)
      onClose()
      router.refresh()
    })
  }

  if (!open) return null

  return (
    <>
      <AppDialog
        open={open}
        title="講師を編集"
        description={coach.name}
        busy={busy}
        onClose={onClose}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="text-sm text-error hover:underline disabled:opacity-60"
              aria-label={`${coach.name}を削除`}
            >
              この講師を削除
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="submit"
                form={formId}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
                aria-busy={pending || undefined}
              >
                {pending ? '保存中…' : '更新する'}
              </button>
            </div>
          </div>
        }
      >
        <form id={formId} action={formAction} className="space-y-3">
          <CoachFormFields coach={coach} formId={formId} pending={busy} />
          {state.error && (
            <p className="text-sm text-error" role="alert">
              {state.error}
            </p>
          )}
        </form>
      </AppDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="講師を削除しますか？"
        description={`${coach.name} を削除します。この操作は取り消せません。予約や枠で使用中の場合は削除できません。`}
        confirmLabel="削除する"
        busy={deletePending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (!deletePending) setConfirmDelete(false)
        }}
      />
    </>
  )
}

function PreviewCoachDialog({
  coach,
  open,
  onClose,
}: {
  coach: CoachingCoach
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  return (
    <AppDialog
      open={open}
      title="生徒画面での表示"
      description={coach.name}
      onClose={onClose}
      className="w-[min(28rem,calc(100vw-2rem))] max-h-[min(90vh,40rem)] overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <CoachProfileDisplay coach={coach} variant="plain" />
    </AppDialog>
  )
}

function InstructorCard({
  coach,
  onPreview,
  onEdit,
}: {
  coach: CoachingCoach
  onPreview: (trigger: HTMLElement | null) => void
  onEdit: (trigger: HTMLElement | null) => void
}) {
  const attributes = getCoachAttributeTags(coach)
  const subjects = getCoachStrongSubjects(coach)
  const features = getCoachFeatureLabels(coach)
  const featureSummary = summarizeCoachText(features.join('、'), 60)
  const bioSummary = summarizeCoachText(coach.bio, 100)

  return (
    <li className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{coach.name}</p>
          <p className="mt-0.5 text-xs text-muted">表示順 {coach.sort_order}</p>
        </div>
        <span
          className={
            coach.is_active
              ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
              : 'rounded-md bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted'
          }
        >
          {coach.is_active ? '表示中' : '非表示'}
        </span>
      </div>

      {attributes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {attributes.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      {subjects.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-semibold text-foreground">得意科目</span>
          {' · '}
          <span className="break-words">{subjects.join('、')}</span>
        </p>
      )}

      {featureSummary && (
        <p className="mt-1 line-clamp-2 text-xs text-muted">
          <span className="font-semibold text-foreground">特徴</span>
          {' · '}
          {featureSummary}
        </p>
      )}

      {bioSummary && (
        <p className="mt-2 line-clamp-3 text-sm text-muted">{bioSummary}</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={(event) => onPreview(event.currentTarget)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`${coach.name}のプレビュー`}
        >
          プレビュー
        </button>
        <button
          type="button"
          onClick={(event) => onEdit(event.currentTarget)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`${coach.name}を編集`}
        >
          編集
        </button>
      </div>
    </li>
  )
}

interface AdminCoachingInstructorsManagerProps {
  coaches: CoachingCoach[]
}

type DialogMode =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; coachId: string }
  | { type: 'preview'; coachId: string }

export function AdminCoachingInstructorsManager({ coaches }: AdminCoachingInstructorsManagerProps) {
  const [mode, setMode] = useState<DialogMode>({ type: 'none' })
  const [createNonce, setCreateNonce] = useState(0)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const editingCoach =
    mode.type === 'edit' ? (coaches.find((c) => c.id === mode.coachId) ?? null) : null
  const previewCoach =
    mode.type === 'preview' ? (coaches.find((c) => c.id === mode.coachId) ?? null) : null

  function openCreate() {
    restoreFocusRef.current = addButtonRef.current
    setCreateNonce((n) => n + 1)
    setMode({ type: 'create' })
  }

  function openEdit(coachId: string, trigger: HTMLElement | null) {
    restoreFocusRef.current = trigger
    setMode({ type: 'edit', coachId })
  }

  function openPreview(coachId: string, trigger: HTMLElement | null) {
    restoreFocusRef.current = trigger
    setMode({ type: 'preview', coachId })
  }

  function closeDialog() {
    setMode({ type: 'none' })
    queueMicrotask(() => {
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          ref={addButtonRef}
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          講師を追加
        </button>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">登録済み講師</h3>
          <p className="text-sm text-muted">{coaches.length}件</p>
        </div>

        {coaches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted">
            まだ講師が登録されていません。「講師を追加」から登録してください。
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
            {coaches.map((coach) => (
              <InstructorCard
                key={coach.id}
                coach={coach}
                onPreview={(el) => openPreview(coach.id, el)}
                onEdit={(el) => openEdit(coach.id, el)}
              />
            ))}
          </ul>
        )}
      </section>

      {mode.type === 'create' && (
        <CreateCoachDialog key={`create-${createNonce}`} open onClose={closeDialog} />
      )}

      {editingCoach && (
        <EditCoachDialog
          key={editingCoach.id}
          coach={editingCoach}
          open
          onClose={closeDialog}
        />
      )}

      {previewCoach && (
        <PreviewCoachDialog coach={previewCoach} open onClose={closeDialog} />
      )}
    </div>
  )
}
