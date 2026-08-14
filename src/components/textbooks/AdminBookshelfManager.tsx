'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import {
  createTextbookCatalogEntry,
  deleteAdminBookshelfStudentEntry,
  deleteTextbookCatalogEntry,
  updateAdminBookshelfCatalogEntry,
  updateAdminBookshelfStudentEntry,
  type CatalogActionState,
} from '@/app/admin/bookshelf/actions'
import { AdminBulkTextbookRegister } from '@/components/textbooks/AdminBulkTextbookRegister'
import { AdminStudentCheckboxGroups } from '@/components/textbooks/AdminStudentCheckboxGroups'
import { UsageTagFields, inputClass } from '@/components/textbooks/TextbookFormFields'
import {
  TEXTBOOK_SUBJECT_CATEGORIES,
  catalogMatchesCategory,
  type TextbookSubjectCategoryLabel,
} from '@/lib/constants/textbook-subject-categories'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { cn } from '@/lib/utils'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type {
  AdminBookshelfOverview,
  AdminBookshelfStudentEntry,
  TextbookCatalog,
  TextbookCatalogWithUsers,
  TextbookUser,
} from '@/types/textbook'

const initialState: CatalogActionState = {}

type BookshelfTab = 'register' | 'browse'

type EditingCatalog = TextbookCatalogWithUsers & { kind: 'catalog' }
type EditingStudent = AdminBookshelfStudentEntry & { kind: 'student' }
type EditingItem = EditingCatalog | EditingStudent

interface AdminBookshelfManagerProps {
  overview: AdminBookshelfOverview
  studentGroups: StudentListGroup[]
  catalog: TextbookCatalog[]
  initialTab: BookshelfTab
  initialSubject: TextbookSubjectCategoryLabel
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  )
}

function UsersList({ users }: { users: TextbookUser[] }) {
  if (users.length === 0) {
    return <p className="mt-2 text-xs text-muted">利用中の生徒はいません</p>
  }

  return (
    <p className="mt-2 line-clamp-3 text-xs text-muted">
      利用中（{users.length}人）: {users.map((user) => user.student_name).join('、')}
    </p>
  )
}

function BookshelfCard({
  title,
  badge,
  badgeClassName,
  subjects,
  usageTags,
  users,
  onEdit,
}: {
  title: string
  badge: string
  badgeClassName: string
  subjects: string[]
  usageTags: string[]
  users: TextbookUser[]
  onEdit: () => void
}) {
  return (
    <article className="relative flex h-full flex-col rounded-lg border border-border bg-background p-4">
      <button
        type="button"
        onClick={onEdit}
        className="absolute right-3 top-3 rounded-md p-1.5 text-muted transition hover:bg-card hover:text-primary"
        aria-label={`${title}を編集`}
      >
        <PencilIcon />
      </button>

      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium leading-snug">{title}</h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClassName}`}>
            {badge}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-muted">
          {subjects.join('・')}
          {usageTags.length > 0 ? ` / ${usageTags.join('・')}` : ''}
        </p>
        <UsersList users={users} />
      </div>
    </article>
  )
}

function CatalogCreateForm() {
  const [state, formAction, pending] = useActionState(createTextbookCatalogEntry, initialState)

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h3 className="font-medium">参考書を本棚に追加</h3>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          参考書名 <span className="text-error">*</span>
        </span>
        <input type="text" name="name" required placeholder="例: チャート式 数学IA" className={inputClass} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          科目タグ <span className="text-error">*</span>
        </span>
        <p className="mb-2 text-xs text-muted">カンマ区切りで入力（例: 数学IA, 数学IIBC）</p>
        <input
          type="text"
          name="subjects"
          required
          placeholder={EXAM_SUBJECTS.slice(0, 4).join(', ')}
          className={inputClass}
        />
      </label>

      <UsageTagFields />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">公開設定</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="public" defaultChecked className="accent-primary" />
            公開
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="private" className="accent-primary" />
            非公開
          </label>
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">本棚に追加しました</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : '本棚に追加'}
      </button>
    </form>
  )
}

function EditBookshelfModal({
  item,
  studentGroups,
  onClose,
}: {
  item: EditingItem
  studentGroups: StudentListGroup[]
  onClose: () => void
}) {
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

  const textbookIdsByStudent =
    item.kind === 'catalog' ? item.textbookIdsByStudent : item.textbookIdsByStudent

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

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">参考書名</span>
            <input type="text" name="name" required defaultValue={item.name} className={inputClass} />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">科目タグ（カンマ区切り）</span>
            <input
              type="text"
              name="subjects"
              required
              defaultValue={item.subjects.join(', ')}
              className={inputClass}
            />
          </label>

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
            <AdminStudentCheckboxGroups
              studentGroups={studentGroups}
              selectedIds={selectedIds}
              onToggleStudent={toggleStudent}
              onToggleGroup={toggleGroup}
            />
          </div>

          {state.error && <p className="text-sm text-error">{state.error}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending || selectedIds.size === 0}
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

function BookshelfGrid({
  items,
  onEditCatalog,
  onEditStudent,
}: {
  items: Array<
    | { type: 'catalog'; item: TextbookCatalogWithUsers }
    | { type: 'student'; item: AdminBookshelfStudentEntry }
  >
  onEditCatalog: (item: TextbookCatalogWithUsers) => void
  onEditStudent: (item: AdminBookshelfStudentEntry) => void
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">登録されている参考書はありません。</p>
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((entry) =>
        entry.type === 'catalog' ? (
          <BookshelfCard
            key={`catalog-${entry.item.id}`}
            title={entry.item.name}
            badge={entry.item.visibility === 'public' ? '公開' : '非公開'}
            badgeClassName={
              entry.item.visibility === 'public'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }
            subjects={entry.item.subjects}
            usageTags={entry.item.usage_tags}
            users={entry.item.users}
            onEdit={() => onEditCatalog(entry.item)}
          />
        ) : (
          <BookshelfCard
            key={`student-${entry.item.key}`}
            title={entry.item.name}
            badge="生徒登録"
            badgeClassName="bg-amber-50 text-amber-700"
            subjects={entry.item.subjects}
            usageTags={entry.item.usage_tags}
            users={entry.item.users}
            onEdit={() => onEditStudent(entry.item)}
          />
        ),
      )}
    </div>
  )
}

export function AdminBookshelfManager({
  overview,
  studentGroups,
  catalog,
  initialTab,
  initialSubject,
}: AdminBookshelfManagerProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<BookshelfTab>(initialTab)
  const [selectedSubject, setSelectedSubject] = useState<TextbookSubjectCategoryLabel>(initialSubject)
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null)

  function switchTab(tab: BookshelfTab) {
    setActiveTab(tab)
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (tab === 'browse') {
      params.set('subject', selectedSubject)
    }
    router.replace(`/admin/bookshelf?${params.toString()}`, { scroll: false })
  }

  function switchSubject(subject: TextbookSubjectCategoryLabel) {
    setSelectedSubject(subject)
    const params = new URLSearchParams()
    params.set('tab', 'browse')
    params.set('subject', subject)
    router.replace(`/admin/bookshelf?${params.toString()}`, { scroll: false })
  }

  const filteredPublicCatalog = useMemo(
    () =>
      overview.catalog.filter(
        (item) =>
          item.visibility === 'public' && catalogMatchesCategory(item.subjects, selectedSubject),
      ),
    [overview.catalog, selectedSubject],
  )

  const filteredPrivateCatalog = useMemo(
    () =>
      overview.catalog.filter(
        (item) =>
          item.visibility === 'private' && catalogMatchesCategory(item.subjects, selectedSubject),
      ),
    [overview.catalog, selectedSubject],
  )

  const filteredStudentEntries = useMemo(
    () =>
      overview.studentEntries.filter((item) =>
        catalogMatchesCategory(item.subjects, selectedSubject),
      ),
    [overview.studentEntries, selectedSubject],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchTab('register')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            activeTab === 'register'
              ? 'bg-primary text-white'
              : 'border border-border hover:bg-background',
          )}
        >
          参考書を登録
        </button>
        <button
          type="button"
          onClick={() => switchTab('browse')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            activeTab === 'browse'
              ? 'bg-primary text-white'
              : 'border border-border hover:bg-background',
          )}
        >
          本棚を見る
        </button>
      </div>

      {activeTab === 'register' ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-bold">本棚に追加</h3>
            <CatalogCreateForm />
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold">生徒に登録</h3>
            <p className="text-sm text-muted">
              本棚の参考書から選ぶか新規入力して、複数の生徒に直接登録できます。
            </p>
            <AdminBulkTextbookRegister studentGroups={studentGroups} catalog={catalog} />
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-bold">科目を選択</h3>
            <div className="flex flex-wrap gap-2">
              {TEXTBOOK_SUBJECT_CATEGORIES.map((category) => (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => switchSubject(category.label)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm transition',
                    selectedSubject === category.label
                      ? 'bg-primary text-white'
                      : 'border border-border hover:bg-background',
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">公開の参考書</h3>
            <BookshelfGrid
              items={filteredPublicCatalog.map((item) => ({ type: 'catalog' as const, item }))}
              onEditCatalog={(item) => setEditingItem({ ...item, kind: 'catalog' })}
              onEditStudent={() => undefined}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">非公開の参考書</h3>
            <BookshelfGrid
              items={filteredPrivateCatalog.map((item) => ({ type: 'catalog' as const, item }))}
              onEditCatalog={(item) => setEditingItem({ ...item, kind: 'catalog' })}
              onEditStudent={() => undefined}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">生徒が登録した参考書</h3>
            <BookshelfGrid
              items={filteredStudentEntries.map((item) => ({ type: 'student' as const, item }))}
              onEditCatalog={() => undefined}
              onEditStudent={(item) => setEditingItem({ ...item, kind: 'student' })}
            />
          </section>
        </div>
      )}

      {editingItem && (
        <EditBookshelfModal
          item={editingItem}
          studentGroups={studentGroups}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}
