'use client'

import { useActionState } from 'react'
import {
  createFaqCategory,
  createFaqItem,
  deleteFaqCategory,
  deleteFaqItem,
  updateFaqItem,
  type FaqActionState,
} from '@/app/faq/actions'
import { useActionToast } from '@/hooks/useActionToast'
import type { FaqCategoryWithItems } from '@/types/faq'

const initialState: FaqActionState = {}

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const textareaClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function FaqItemEditor({ item }: { item: FaqCategoryWithItems['items'][number] }) {
  const [state, formAction, pending] = useActionState(updateFaqItem, initialState)

  useActionToast(state, {
    successMessage: 'FAQを保存しました',
    pending,
  })

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={item.id} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">質問</span>
          <input
            type="text"
            name="question"
            required
            defaultValue={item.question}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">回答</span>
          <textarea
            name="answer"
            required
            rows={5}
            defaultValue={item.answer}
            className={textareaClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={item.is_published}
            className="accent-primary"
          />
          公開する
        </label>

        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : '変更を保存'}
          </button>
        </div>
      </form>
      <form
        action={deleteFaqItem}
        className="mt-3"
        onSubmit={(event) => {
          if (!window.confirm('このFAQを削除しますか？')) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" className="text-sm text-error hover:underline">
          削除
        </button>
      </form>
    </article>
  )
}

function CreateFaqItemForm({ categoryId }: { categoryId: string }) {
  const [state, formAction, pending] = useActionState(createFaqItem, initialState)

  useActionToast(state, {
    successMessage: 'FAQを追加しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <input type="hidden" name="categoryId" value={categoryId} />
      <p className="text-sm font-medium">FAQを追加</p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">質問</span>
        <input type="text" name="question" required className={fieldClass} />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">回答</span>
        <textarea name="answer" required rows={4} className={textareaClass} />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked className="accent-primary" />
        公開する
      </label>

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-card disabled:opacity-60"
      >
        {pending ? '追加中…' : 'FAQを追加'}
      </button>
    </form>
  )
}

export function AdminFaqManager({ categories }: { categories: FaqCategoryWithItems[] }) {
  const [categoryState, categoryAction, categoryPending] = useActionState(
    createFaqCategory,
    initialState,
  )

  useActionToast(categoryState, {
    successMessage: 'カテゴリを追加しました',
    pending: categoryPending,
  })

  return (
    <div className="space-y-6">
      <form action={categoryAction} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-medium">カテゴリを追加</h3>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">カテゴリ名</span>
          <input
            type="text"
            name="name"
            required
            placeholder="例: はじめての方へ"
            className={fieldClass}
          />
        </label>
        {categoryState.error && (
          <p className="text-sm text-error" role="alert">
            {categoryState.error}
          </p>
        )}
        <button
          type="submit"
          disabled={categoryPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {categoryPending ? '追加中…' : 'カテゴリを追加'}
        </button>
      </form>

      {categories.length === 0 ? (
        <p className="text-sm text-muted">FAQカテゴリがまだありません。</p>
      ) : (
        categories.map((category) => (
          <section
            key={category.id}
            className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{category.name}</h3>
                <p className="mt-1 text-xs text-muted">{category.items.length} 件</p>
              </div>
              <form
                action={deleteFaqCategory}
                onSubmit={(event) => {
                  if (!window.confirm('カテゴリと中のFAQをすべて削除しますか？')) {
                    event.preventDefault()
                  }
                }}
              >
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className="text-sm text-error hover:underline">
                  カテゴリを削除
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {category.items.map((item) => (
                <FaqItemEditor key={item.id} item={item} />
              ))}
            </div>

            <CreateFaqItemForm categoryId={category.id} />
          </section>
        ))
      )}
    </div>
  )
}
