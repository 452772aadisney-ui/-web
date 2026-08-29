'use client'

import { useState } from 'react'
import { TEXTBOOK_DETAIL_TAG_GROUPS } from '@/lib/constants/textbook-detail-tags'
import { cn } from '@/lib/utils'

interface TextbookDetailTagFieldsProps {
  defaultDetailTags?: string[]
  legend?: string
  required?: boolean
}

export function TextbookDetailTagFields({
  defaultDetailTags = [],
  legend = '科目タグ',
  required = true,
}: TextbookDetailTagFieldsProps) {
  const [detailTags, setDetailTags] = useState<Set<string>>(() => new Set(defaultDetailTags))

  function toggleTag(tag: string) {
    setDetailTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        {legend}
        {required && <span className="text-error"> *</span>}
      </legend>
      <p className="mb-2 text-xs text-muted">
        親の教科ごとに科目（子タグ）を選べます。子タグから教科も自動で判別されます。
      </p>
      <div className="space-y-3">
        {TEXTBOOK_DETAIL_TAG_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 text-xs font-semibold text-muted">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <label
                  key={tag}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs',
                    detailTags.has(tag)
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-background',
                  )}
                >
                  <input
                    type="checkbox"
                    name="detailTags"
                    value={tag}
                    checked={detailTags.has(tag)}
                    onChange={() => toggleTag(tag)}
                    className="sr-only"
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  )
}
