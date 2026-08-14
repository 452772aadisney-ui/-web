'use client'

import { useActionState, useTransition } from 'react'
import {
  createTextbookCatalogEntry,
  deleteTextbookCatalogEntry,
  updateTextbookCatalogVisibility,
  type CatalogActionState,
} from '@/app/admin/bookshelf/actions'
import { UsageTagFields, inputClass } from '@/components/textbooks/TextbookFormFields'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type {
  AdminBookshelfOverview,
  AdminBookshelfStudentEntry,
  TextbookCatalogWithUsers,
  TextbookUser,
} from '@/types/textbook'

const initialState: CatalogActionState = {}

interface AdminBookshelfManagerProps {
  overview: AdminBookshelfOverview
}

function UsersList({ users }: { users: TextbookUser[] }) {
  if (users.length === 0) {
    return <p className="mt-2 text-xs text-muted">利用中の生徒はいません</p>
  }

  return (
    <p className="mt-2 text-xs text-muted">
      利用中（{users.length}人）: {users.map((user) => user.student_name).join('、')}
    </p>
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
            公開（全員がリストから選べる）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="visibility" value="private" className="accent-primary" />
            非公開（登録者と管理者のみ）
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

function DeleteCatalogButton({ catalogId }: { catalogId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('この参考書を本棚から削除しますか？')) return
        startTransition(async () => {
          await deleteTextbookCatalogEntry(catalogId)
        })
      }}
      className="text-xs text-error hover:underline disabled:opacity-60"
    >
      削除
    </button>
  )
}

function VisibilityToggle({
  catalogId,
  visibility,
}: {
  catalogId: string
  visibility: TextbookCatalogWithUsers['visibility']
}) {
  const [pending, startTransition] = useTransition()

  return (
    <select
      value={visibility}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as TextbookCatalogWithUsers['visibility']
        startTransition(async () => {
          await updateTextbookCatalogVisibility(catalogId, next)
        })
      }}
      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
    >
      <option value="public">公開</option>
      <option value="private">非公開</option>
    </select>
  )
}

function CatalogItem({ item }: { item: TextbookCatalogWithUsers }) {
  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.name}</p>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              管理者登録
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {item.subjects.join('・')}
            {item.usage_tags.length > 0 ? ` / ${item.usage_tags.join('・')}` : ''}
          </p>
          <UsersList users={item.users} />
        </div>
        <div className="flex items-center gap-2">
          <VisibilityToggle catalogId={item.id} visibility={item.visibility} />
          <DeleteCatalogButton catalogId={item.id} />
        </div>
      </div>
    </li>
  )
}

function StudentEntryItem({ item }: { item: AdminBookshelfStudentEntry }) {
  return (
    <li className="rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.name}</p>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              生徒登録
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {item.subjects.join('・')}
            {item.usage_tags.length > 0 ? ` / ${item.usage_tags.join('・')}` : ''}
          </p>
          <UsersList users={item.users} />
        </div>
      </div>
    </li>
  )
}

function renderCatalogSection(items: TextbookCatalogWithUsers[], title: string) {
  if (items.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-muted">{title}</h3>
        <p className="text-sm text-muted">登録されている参考書はありません。</p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-muted">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <CatalogItem key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

export function AdminBookshelfManager({ overview }: AdminBookshelfManagerProps) {
  const publicCatalog = overview.catalog.filter((item) => item.visibility === 'public')
  const privateCatalog = overview.catalog.filter((item) => item.visibility === 'private')

  return (
    <div className="space-y-8">
      <CatalogCreateForm />
      {renderCatalogSection(publicCatalog, '公開の参考書（管理者登録）')}
      {renderCatalogSection(privateCatalog, '非公開の参考書（管理者登録）')}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-muted">生徒が登録した参考書</h3>
        {overview.studentEntries.length === 0 ? (
          <p className="text-sm text-muted">生徒が独自に登録した参考書はありません。</p>
        ) : (
          <ul className="space-y-3">
            {overview.studentEntries.map((item) => (
              <StudentEntryItem key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
