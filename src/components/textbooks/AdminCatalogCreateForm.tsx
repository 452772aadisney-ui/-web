'use client'

import { useActionState } from 'react'
import { createTextbookCatalogEntry, type CatalogActionState } from '@/app/admin/bookshelf/actions'
import { TextbookCatalogMetadataFields } from '@/components/textbooks/TextbookCatalogMetadataFields'
import { UsageTagFields, inputClass } from '@/components/textbooks/TextbookFormFields'
import { useActionToast } from '@/hooks/useActionToast'

const initialState: CatalogActionState = {}

export function AdminCatalogCreateForm({ publishers }: { publishers: string[] }) {
  const [state, formAction, pending] = useActionState(createTextbookCatalogEntry, initialState)

  useActionToast(state, {
    successMessage: '本棚に追加しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          参考書名 <span className="text-error">*</span>
        </span>
        <input type="text" name="name" required placeholder="例: チャート式 数学IA" className={inputClass} />
      </label>

      <TextbookCatalogMetadataFields publishers={publishers} />

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

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

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
