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
import type { TextbookCatalog, TextbookCatalogUsage } from '@/types/textbook'

const initialState: CatalogActionState = {}

interface AdminBookshelfManagerProps {
  catalog: TextbookCatalog[]
  usage: TextbookCatalogUsage[]
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
  visibility: TextbookCatalog['visibility']
}) {
  const [pending, startTransition] = useTransition()

  return (
    <select
      value={visibility}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as TextbookCatalog['visibility']
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

export function AdminBookshelfManager({ catalog, usage }: AdminBookshelfManagerProps) {
  const usageByCatalog = new Map<string, TextbookCatalogUsage[]>()
  for (const row of usage) {
    const list = usageByCatalog.get(row.catalog_id) ?? []
    list.push(row)
    usageByCatalog.set(row.catalog_id, list)
  }

  const publicCatalog = catalog.filter((item) => item.visibility === 'public')
  const privateCatalog = catalog.filter((item) => item.visibility === 'private')

  function renderCatalogList(items: TextbookCatalog[], title: string) {
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
          {items.map((item) => {
            const users = usageByCatalog.get(item.id) ?? []
            return (
              <li key={item.id} className="rounded-lg border border-border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.subjects.join('・')}
                      {item.usage_tags.length > 0 ? ` / ${item.usage_tags.join('・')}` : ''}
                    </p>
                    {users.length > 0 ? (
                      <p className="mt-2 text-xs text-muted">
                        利用中: {users.map((user) => user.student_name).join('、')}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">利用中の生徒はいません</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <VisibilityToggle catalogId={item.id} visibility={item.visibility} />
                    <DeleteCatalogButton catalogId={item.id} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <CatalogCreateForm />
      {renderCatalogList(publicCatalog, '公開の参考書')}
      {renderCatalogList(privateCatalog, '非公開の参考書')}
    </div>
  )
}
