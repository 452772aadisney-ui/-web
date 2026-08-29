'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  deleteAdminBookshelfStudentEntry,
  deleteTextbookCatalogEntry,
  updateAdminBookshelfCatalogEntry,
  updateAdminBookshelfStudentEntry,
  type CatalogActionState,
} from '@/app/admin/bookshelf/actions'
import { AdminStudentCheckboxGroups } from '@/components/textbooks/AdminStudentCheckboxGroups'
import { TextbookCatalogMetadataFields } from '@/components/textbooks/TextbookCatalogMetadataFields'
import { TextbookDetailTagFields } from '@/components/textbooks/TextbookDetailTagFields'
import { UsageTagFields, inputClass } from '@/components/textbooks/TextbookFormFields'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type {
  AdminBookshelfOverview,
  AdminBookshelfStudentEntry,
  TextbookCatalog,
  TextbookCatalogWithUsers,
} from '@/types/textbook'

const initialState: CatalogActionState = {}

export type AdminEditingCatalog = TextbookCatalogWithUsers & { kind: 'catalog' }
export type AdminEditingStudent = AdminBookshelfStudentEntry & { kind: 'student' }
export type AdminEditingItem = AdminEditingCatalog | AdminEditingStudent

export function catalogToEditingItem(
  item: TextbookCatalog,
  overview: AdminBookshelfOverview,
): AdminEditingCatalog {
  const existing = overview.catalog.find((entry) => entry.id === item.id)
  if (existing) {
    return { ...existing, kind: 'catalog' }
  }

  return {
    ...item,
    kind: 'catalog',
    isManagedCatalog: true,
    users: [],
    textbookIdsByStudent: {},
  }
}

interface AdminBookshelfEditModalProps {
  item: AdminEditingItem
  studentGroups: StudentListGroup[]
  onClose: () => void
}

export function AdminBookshelfEditModal({
  item,
  studentGroups,
  onClose,
}: AdminBookshelfEditModalProps) {
  const isCatalog = item.kind === 'catalog'
  const [catalogState, catalogAction, catalogPending] = useActionState(
    updateAdminBookshelfCatalogEntry,
    initialState,
  )
  const [studentState, studentAction, studentPending] = useActionState(
    updateAdminBookshelfStudentEntry,
    initialState,
  )
  const [deletePending, startDeleteTransition] = useTransition()

  const state = isCatalog ? catalogState : studentState
  const pending = isCatalog ? catalogPending : studentPending

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(item.users.map((user) => user.student_id)),
  )
  const [createCatalogMaster, setCreateCatalogMaster] = useState(
    isCatalog ? !item.isManagedCatalog : false,
  )

  useEffect(() => {
    if (state.success) onClose()
  }, [state.success, onClose])

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(group: StudentListGroup) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = group.students.every((student) => next.has(student.id))
      for (const student of group.students) {
        if (allSelected) next.delete(student.id)
        else next.add(student.id)
      }
      return next
    })
  }

  const textbookIdsByStudent = item.textbookIdsByStudent

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookshelf-edit-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 id="bookshelf-edit-title" className="text-lg font-bold">
              参考書を編集
            </h3>
            <p className="mt-1 text-sm text-muted">{item.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-background"
          >
            閉じる
          </button>
        </div>

        <form action={isCatalog ? catalogAction : studentAction} className="space-y-4">
          {isCatalog && (
            <>
              <input type="hidden" name="catalogId" value={item.id} />
              <input type="hidden" name="isManagedCatalog" value={String(item.isManagedCatalog)} />
            </>
          )}
          <input
            type="hidden"
            name="textbookIdsJson"
            value={JSON.stringify(textbookIdsByStudent)}
          />
          {[...selectedIds].map((studentId) => (
            <input key={studentId} type="hidden" name="studentIds" value={studentId} />
          ))}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">参考書名</span>
            <input type="text" name="name" required defaultValue={item.name} className={inputClass} />
          </label>

          {isCatalog ? (
            <TextbookCatalogMetadataFields
              defaultPublisher={item.publisher}
              defaultCoverUrl={item.cover_url}
              defaultDetailTags={item.detail_tags}
              defaultStudyPurposes={item.study_purposes}
              defaultUniversities={item.target_universities}
            />
          ) : (
            <TextbookDetailTagFields defaultDetailTags={item.detail_tags} />
          )}

          <UsageTagFields selectedUsageTags={item.usage_tags} />

          {((isCatalog && item.isManagedCatalog) ||
            ((!isCatalog || !item.isManagedCatalog) && createCatalogMaster)) && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">公開設定</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    defaultChecked={isCatalog && item.isManagedCatalog && item.visibility === 'public'}
                    className="accent-primary"
                  />
                  公開
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    defaultChecked={
                      !isCatalog ||
                      !item.isManagedCatalog ||
                      (isCatalog && item.visibility === 'private')
                    }
                    className="accent-primary"
                  />
                  非公開
                </label>
              </div>
            </fieldset>
          )}

          {(!isCatalog || !item.isManagedCatalog) && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="createCatalogMaster"
                checked={createCatalogMaster}
                onChange={(event) => setCreateCatalogMaster(event.target.checked)}
                className="accent-primary"
              />
              本棚マスタとして管理する
            </label>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">利用する生徒</p>
            <p className="mb-2 text-xs text-muted">
              名前や科目だけ変更する場合は、そのまま保存できます。
            </p>
            <AdminStudentCheckboxGroups
              studentGroups={studentGroups}
              selectedIds={selectedIds}
              onToggleStudent={toggleStudent}
              onToggleGroup={toggleGroup}
              inputName=""
            />
          </div>

          {state.error && <p className="text-sm text-error">{state.error}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? '保存中…' : '変更を保存'}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-foreground">
              キャンセル
            </button>
            {isCatalog && item.isManagedCatalog && (
              <button
                type="button"
                disabled={deletePending}
                onClick={() => {
                  if (!window.confirm('本棚マスタから削除しますか？生徒の登録は残ります。')) return
                  startDeleteTransition(async () => {
                    await deleteTextbookCatalogEntry(item.id)
                    onClose()
                  })
                }}
                className="ml-auto text-sm text-error hover:underline disabled:opacity-60"
              >
                本棚マスタを削除
              </button>
            )}
            {!isCatalog && (
              <button
                type="button"
                disabled={deletePending}
                onClick={() => {
                  if (!window.confirm('この参考書をすべての生徒から削除しますか？')) return
                  startDeleteTransition(async () => {
                    await deleteAdminBookshelfStudentEntry(JSON.stringify(textbookIdsByStudent))
                    onClose()
                  })
                }}
                className="ml-auto text-sm text-error hover:underline disabled:opacity-60"
              >
                参考書を削除
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
