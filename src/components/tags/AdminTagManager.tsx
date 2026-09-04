'use client'

import { useActionState } from 'react'
import {
  createStudentTag,
  deleteStudentTag,
  type TagActionState,
} from '@/app/tags/actions'
import { groupTagsByCategory } from '@/lib/tags/group'
import { useActionToast } from '@/hooks/useActionToast'
import type { StudentTag } from '@/types/tag'

const initialState: TagActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function AdminTagManager({ tags }: { tags: StudentTag[] }) {
  const [state, formAction, pending] = useActionState(createStudentTag, initialState)
  const grouped = groupTagsByCategory(tags)

  useActionToast(state, {
    successMessage: 'タグを追加しました',
    pending,
  })

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
        <h3 className="font-medium">新しいタグを追加</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">カテゴリ</span>
            <input
              name="category"
              placeholder="例: 学年、系統、クラス"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">タグ名 *</span>
            <input name="name" required placeholder="例: 高3、文系" className={fieldClass} />
          </label>
        </div>
        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? '追加中…' : '追加'}
        </button>
      </form>

      {tags.length > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, categoryTags]) => (
            <div key={category} className="rounded-lg border border-border p-4">
              <h3 className="mb-3 font-medium">{category}</h3>
              <ul className="space-y-2">
                {categoryTags.map((tag) => (
                  <li key={tag.id} className="flex items-center justify-between gap-4 text-sm">
                    <span>{tag.name}</span>
                    <form action={deleteStudentTag}>
                      <input type="hidden" name="id" value={tag.id} />
                      <button type="submit" className="text-xs text-error hover:underline">
                        削除
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
