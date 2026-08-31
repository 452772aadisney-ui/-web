'use client'

import { useState } from 'react'
import { TEXTBOOK_DETAIL_TAG_GROUPS } from '@/lib/constants/textbook-detail-tags'
import {
  TEXTBOOK_STUDY_PURPOSES,
  TEXTBOOK_TARGET_UNIVERSITIES,
} from '@/lib/constants/textbook-search'
import { cn } from '@/lib/utils'
import { inputClass } from '@/components/textbooks/TextbookFormFields'
import { TextbookPublisherSelect } from '@/components/textbooks/TextbookPublisherSelect'

interface TextbookCatalogMetadataFieldsProps {
  publishers: string[]
  defaultPublisher?: string | null
  defaultCoverUrl?: string | null
  defaultDetailTags?: string[]
  defaultStudyPurposes?: string[]
  defaultUniversities?: string[]
}

export function TextbookCatalogMetadataFields({
  publishers,
  defaultPublisher = '',
  defaultCoverUrl = '',
  defaultDetailTags = [],
  defaultStudyPurposes = [],
  defaultUniversities = [],
}: TextbookCatalogMetadataFieldsProps) {
  const [detailTags, setDetailTags] = useState<Set<string>>(
    () => new Set(defaultDetailTags),
  )
  const [studyPurposes, setStudyPurposes] = useState<Set<string>>(
    () => new Set(defaultStudyPurposes),
  )
  const [universities, setUniversities] = useState<Set<string>>(
    () => new Set(defaultUniversities),
  )

  function toggleSetValue(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string,
  ) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <TextbookPublisherSelect publishers={publishers} defaultPublisher={defaultPublisher} />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">表紙画像URL</span>
        <input
          type="url"
          name="coverUrl"
          defaultValue={defaultCoverUrl ?? ''}
          placeholder="https://... または Amazon商品ページのURL"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">
          画像URLのほか、Amazon.co.jp の商品ページURLを入力すると表紙画像を自動取得します（取得できない場合があります）。
        </p>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">科目タグ <span className="text-error">*</span></legend>
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
                      onChange={() => toggleSetValue(setDetailTags, tag)}
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

      <fieldset>
        <legend className="mb-2 text-sm font-medium">使用目的（任意）</legend>
        <div className="flex flex-wrap gap-2">
          {TEXTBOOK_STUDY_PURPOSES.map((purpose) => (
            <label
              key={purpose}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium',
                studyPurposes.has(purpose)
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-background',
              )}
            >
              <input
                type="checkbox"
                name="studyPurposes"
                value={purpose}
                checked={studyPurposes.has(purpose)}
                onChange={() => toggleSetValue(setStudyPurposes, purpose)}
                className="sr-only"
              />
              {purpose}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">大学別（任意）</legend>
        <div className="flex flex-wrap gap-2">
          {TEXTBOOK_TARGET_UNIVERSITIES.map((university) => (
            <label
              key={university}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-1 text-xs',
                universities.has(university)
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-background',
              )}
            >
              <input
                type="checkbox"
                name="targetUniversities"
                value={university}
                checked={universities.has(university)}
                onChange={() => toggleSetValue(setUniversities, university)}
                className="sr-only"
              />
              {university}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
