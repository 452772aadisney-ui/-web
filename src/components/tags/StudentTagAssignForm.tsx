'use client'

import { useActionState } from 'react'
import { updateProfileTags, type TagActionState } from '@/app/tags/actions'
import { groupTagsByCategory } from '@/lib/tags/group'
import type { StudentTag } from '@/types/tag'

const initialState: TagActionState = {}

interface StudentTagAssignFormProps {
  profileId: string
  allTags: StudentTag[]
  assignedTagIds: string[]
}

export function StudentTagAssignForm({
  profileId,
  allTags,
  assignedTagIds,
}: StudentTagAssignFormProps) {
  const [state, formAction, pending] = useActionState(updateProfileTags, initialState)
  const assigned = new Set(assignedTagIds)
  const grouped = groupTagsByCategory(allTags)

  if (allTags.length === 0) {
    return (
      <p className="text-sm text-muted">
        タグが未登録です。
        <a href="/admin/tags" className="ml-1 text-primary hover:underline">
          タグ管理
        </a>
        から作成してください。
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="profileId" value={profileId} />
      {Array.from(grouped.entries()).map(([category, tags]) => (
        <div key={category}>
          <p className="mb-2 text-sm font-medium">{category}</p>
          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <label key={tag.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`tag_${tag.id}`}
                  defaultChecked={assigned.has(tag.id)}
                  className="h-4 w-4 rounded border-border text-primary"
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">タグを更新しました</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? '保存中…' : 'タグを保存'}
      </button>
    </form>
  )
}
