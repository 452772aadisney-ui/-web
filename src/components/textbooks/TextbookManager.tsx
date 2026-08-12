'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  createTextbook,
  deleteTextbook,
  updateTextbook,
  type TextbookActionState,
} from '@/app/textbooks/actions'
import {
  inputClass,
  SubjectTagFields,
  TextbookDateFields,
  UsageTagFields,
} from '@/components/textbooks/TextbookFormFields'
import { formatTextbookPeriod } from '@/lib/textbooks/format'
import type { Textbook } from '@/types/textbook'

const initialState: TextbookActionState = {}

interface TextbookManagerProps {
  studentId: string
  profileSubjects: string[]
  textbooks: Textbook[]
  editHref?: string
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
  const [state, formAction, pending] = useActionState(
    updateTextbook.bind(null, studentId),
    initialState,
  )

  return (
    <form action={formAction} className="min-w-0 space-y-4 rounded-lg border border-primary/30 bg-blue-50/30 p-4">
      <input type="hidden" name="textbookId" value={book.id} />

      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">
          教材名 <span className="text-error">*</span>
        </span>
        <input
          type="text"
          name="name"
          required
          defaultValue={book.name}
          className={inputClass}
        />
      </label>

      <SubjectTagFields profileSubjects={profileSubjects} selectedSubjects={book.subjects} />
      <UsageTagFields selectedUsageTags={book.usage_tags} />
      <TextbookDateFields startDate={book.start_date} plannedEndDate={book.planned_end_date} />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">更新しました</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-foreground"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}

export function TextbookManager({
  studentId,
  profileSubjects,
  textbooks,
  editHref,
}: TextbookManagerProps) {
  const [state, formAction, pending] = useActionState(
    createTextbook.bind(null, studentId),
    initialState,
  )
  const [editingId, setEditingId] = useState<string | null>(null)

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
      <form action={formAction} className="min-w-0 space-y-4 rounded-lg border border-border bg-background p-4">
        <h3 className="font-medium">教材を追加</h3>

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

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">教材を登録しました</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? '登録中…' : '教材を登録'}
        </button>
      </form>

      {textbooks.length === 0 ? (
        <p className="text-sm text-muted">登録された教材はまだありません。</p>
      ) : (
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
      )}
    </div>
  )
}

export function filterTextbooksBySubject(
  textbooks: Textbook[],
  subject: string,
): Textbook[] {
  if (!subject) return []
  return textbooks.filter((book) => book.subjects.includes(subject))
}
