'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addTextbookFromCatalog,
  createTextbook,
  deleteTextbook,
  updateTextbook,
  type TextbookActionState,
} from '@/app/textbooks/actions'
import {
  SubjectTagFields,
  TextbookDateFields,
  UsageTagFields,
  inputClass,
} from '@/components/textbooks/TextbookFormFields'
import {
  TEXTBOOK_SUBJECT_CATEGORIES,
  catalogMatchesCategory,
} from '@/lib/constants/textbook-subject-categories'
import { formatTextbookPeriod } from '@/lib/textbooks/format'
import type { Textbook, TextbookCatalog } from '@/types/textbook'

const initialState: TextbookActionState = {}

type RegisterMode = 'catalog' | 'create'

interface StudentBookshelfManagerProps {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  editHref?: string
  variant: 'list' | 'register'
}

function TextbookEditForm({
  book,
  studentId,
  profileSubjects,
  onCancel,
}: {
  book: Textbook
  studentId: string
  profileSubjects: string[]
  onCancel: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    updateTextbook.bind(null, studentId),
    initialState,
  )

  useEffect(() => {
    if (state.success) {
      onCancel()
      router.refresh()
    }
  }, [state.success, onCancel, router])

  return (
    <form action={formAction} className="min-w-0 space-y-4 rounded-lg border border-primary/30 bg-blue-50/30 p-4">
      <input type="hidden" name="textbookId" value={book.id} />
      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教材名 <span className="text-error">*</span>
        </span>
        <input type="text" name="name" required defaultValue={book.name} className={inputClass} />
      </label>
      <SubjectTagFields profileSubjects={profileSubjects} selectedSubjects={book.subjects} />
      <UsageTagFields selectedUsageTags={book.usage_tags} />
      <TextbookDateFields startDate={book.start_date} plannedEndDate={book.planned_end_date} />
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{state.error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-foreground">
          キャンセル
        </button>
      </div>
    </form>
  )
}

function CatalogRegisterForm({
  studentId,
  catalog,
  registeredCatalogIds,
}: {
  studentId: string
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
}) {
  const [state, formAction, pending] = useActionState(
    addTextbookFromCatalog.bind(null, studentId),
    initialState,
  )
  const [categoryLabel, setCategoryLabel] = useState<string>(
    TEXTBOOK_SUBJECT_CATEGORIES[0]?.label ?? '',
  )
  const [catalogId, setCatalogId] = useState('')

  const availableCatalog = useMemo(() => {
    const registered = new Set(registeredCatalogIds)
    return catalog.filter((item) => {
      if (registered.has(item.id)) return false
      if (item.visibility === 'public') {
        return catalogMatchesCategory(item.subjects, categoryLabel)
      }
      return false
    })
  }, [catalog, registeredCatalogIds, categoryLabel])

  const selectedCatalog = catalog.find((item) => item.id === catalogId) ?? null

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h3 className="font-medium">リストから選ぶ</h3>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">科目</span>
        <select
          value={categoryLabel}
          onChange={(event) => {
            setCategoryLabel(event.target.value)
            setCatalogId('')
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          {TEXTBOOK_SUBJECT_CATEGORIES.map((category) => (
            <option key={category.label} value={category.label}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">参考書</span>
        <select
          name="catalogId"
          value={catalogId}
          onChange={(event) => setCatalogId(event.target.value)}
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="">選択してください</option>
          {availableCatalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {availableCatalog.length === 0 && (
          <p className="mt-2 text-xs text-muted">この科目で選べる参考書はありません。</p>
        )}
      </label>

      {selectedCatalog && (
        <p className="text-xs text-muted">
          {selectedCatalog.subjects.join('・')}
          {selectedCatalog.usage_tags.length > 0
            ? ` / ${selectedCatalog.usage_tags.join('・')}`
            : ''}
        </p>
      )}

      <UsageTagFields selectedUsageTags={selectedCatalog?.usage_tags} />
      <TextbookDateFields />

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">参考書を登録しました</p>}

      <button
        type="submit"
        disabled={pending || !catalogId}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : 'リストから登録'}
      </button>
    </form>
  )
}

function CreateRegisterForm({
  studentId,
  profileSubjects,
}: {
  studentId: string
  profileSubjects: string[]
}) {
  const [state, formAction, pending] = useActionState(
    createTextbook.bind(null, studentId),
    initialState,
  )

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h3 className="font-medium">新規作成</h3>

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教材名 <span className="text-error">*</span>
        </span>
        <input
          type="text"
          name="name"
          required
          placeholder="例: チャート式 数学IA"
          className={inputClass}
        />
      </label>

      <SubjectTagFields profileSubjects={profileSubjects} />
      <UsageTagFields />
      <TextbookDateFields />

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">教材を登録しました</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : '教材を登録'}
      </button>
    </form>
  )
}

function StudentTextbookList({
  studentId,
  profileSubjects,
  textbooks,
}: {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (textbooks.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">登録された参考書はまだありません。</p>
        <Link href="/dashboard/textbooks/register" className="text-sm font-medium text-primary hover:underline">
          教材を登録する →
        </Link>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {textbooks.map((book) => (
        <li key={book.id} className="rounded-lg border border-border">
          {editingId === book.id ? (
            <div className="p-4">
              <TextbookEditForm
                book={book}
                studentId={studentId}
                profileSubjects={profileSubjects}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">{book.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {book.subjects.join('・')}
                  {book.usage_tags.length > 0 ? ` / ${book.usage_tags.join('・')}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted">
                  期間: {formatTextbookPeriod(book.start_date, book.planned_end_date)}
                </p>
                {!book.is_seen_by_student && (
                  <span className="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    新規
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => setEditingId(book.id)}
                  className="text-xs text-primary hover:underline"
                >
                  編集
                </button>
                <form action={deleteTextbook}>
                  <input type="hidden" name="textbookId" value={book.id} />
                  <input type="hidden" name="studentId" value={studentId} />
                  <button type="submit" className="text-xs text-error hover:underline">
                    削除
                  </button>
                </form>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function StudentTextbookRegister({
  studentId,
  profileSubjects,
  catalog,
  registeredCatalogIds,
  editHref,
}: {
  studentId: string
  profileSubjects: string[]
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  editHref?: string
}) {
  const [mode, setMode] = useState<RegisterMode>('catalog')

  if (profileSubjects.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        使用科目が未設定です。{' '}
        {editHref ? (
          <Link href={editHref} className="font-medium underline">
            プロフィール編集
          </Link>
        ) : (
          'プロフィール編集'
        )}
        で科目を選んでから教材を登録してください。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('catalog')}
          className={`rounded-lg px-3 py-2.5 text-center text-sm font-bold ${
            mode === 'catalog'
              ? 'bg-primary text-white'
              : 'border border-border bg-background text-foreground'
          }`}
        >
          リストから選ぶ
        </button>
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`rounded-lg px-3 py-2.5 text-center text-sm font-bold ${
            mode === 'create'
              ? 'bg-primary text-white'
              : 'border border-border bg-background text-foreground'
          }`}
        >
          新規作成
        </button>
      </div>

      {mode === 'catalog' ? (
        <CatalogRegisterForm
          studentId={studentId}
          catalog={catalog}
          registeredCatalogIds={registeredCatalogIds}
        />
      ) : (
        <CreateRegisterForm studentId={studentId} profileSubjects={profileSubjects} />
      )}
    </div>
  )
}

export function StudentBookshelfManager({
  studentId,
  profileSubjects,
  textbooks,
  catalog,
  registeredCatalogIds,
  editHref,
  variant,
}: StudentBookshelfManagerProps) {
  if (variant === 'list') {
    return (
      <StudentTextbookList
        studentId={studentId}
        profileSubjects={profileSubjects}
        textbooks={textbooks}
      />
    )
  }

  return (
    <StudentTextbookRegister
      studentId={studentId}
      profileSubjects={profileSubjects}
      catalog={catalog}
      registeredCatalogIds={registeredCatalogIds}
      editHref={editHref}
    />
  )
}
