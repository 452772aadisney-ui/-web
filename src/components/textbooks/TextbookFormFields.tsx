'use client'

import { TEXTBOOK_USAGE_TAGS } from '@/lib/constants/textbook-tags'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import { SubjectCheckboxGrid } from '@/components/subjects/SubjectCheckboxGrid'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export const inputClass =
  'block w-full min-w-0 max-w-full rounded-lg border border-border bg-card px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const dateFieldShellClass =
  'w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'

interface TextbookDateFieldsProps {
  startDate?: string | null
  plannedEndDate?: string | null
}

export function TextbookDateFields({
  startDate,
  plannedEndDate,
}: TextbookDateFieldsProps) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">開始日</span>
        <div className={dateFieldShellClass}>
          <input
            type="date"
            name="startDate"
            defaultValue={startDate ?? ''}
            className="study-date-input px-3 py-2.5 outline-none"
          />
        </div>
      </label>
      <label className="block w-full min-w-0">
        <span className="mb-1.5 block text-sm font-medium">終了予定日</span>
        <div className={dateFieldShellClass}>
          <input
            type="date"
            name="plannedEndDate"
            defaultValue={plannedEndDate ?? ''}
            className="study-date-input px-3 py-2.5 outline-none"
          />
        </div>
      </label>
    </div>
  )
}

interface ExamSubjectMultiSelectProps {
  selectedSubjects?: string[]
}

export function ExamSubjectMultiSelect({ selectedSubjects = [] }: ExamSubjectMultiSelectProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedSubjects))

  function toggleSubject(subject: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  const summaryLabel =
    selected.size > 0 ? [...selected].join('、') : '科目を選択してください'

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">
        科目タグ <span className="text-error">*</span>
      </legend>
      <p className="mb-2 text-xs text-muted">プルダウンから複数選択できます</p>
      <details className="rounded-lg border border-border bg-card">
        <summary
          className={cn(
            'cursor-pointer list-none px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden',
            selected.size === 0 && 'text-muted',
          )}
        >
          {summaryLabel}
        </summary>
        <div className="max-h-52 space-y-1 overflow-y-auto border-t border-border p-2">
          {EXAM_SUBJECTS.map((subject) => (
            <label
              key={subject}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-background"
            >
              <input
                type="checkbox"
                name="subjects"
                value={subject}
                checked={selected.has(subject)}
                onChange={() => toggleSubject(subject)}
                className="accent-primary"
              />
              {subject}
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  )
}

interface SubjectTagFieldsProps {
  profileSubjects: string[]
  selectedSubjects?: string[]
}

export function SubjectTagFields({
  profileSubjects,
  selectedSubjects = [],
}: SubjectTagFieldsProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        科目タグ <span className="text-error">*</span>
      </legend>
      <p className="mb-2 text-xs text-muted">プロフィールで選択中の科目から選べます</p>
      <SubjectCheckboxGrid subjects={profileSubjects} selectedSubjects={selectedSubjects} />
    </fieldset>
  )
}

interface UsageTagFieldsProps {
  selectedUsageTags?: string[]
}

export function UsageTagFields({ selectedUsageTags = [] }: UsageTagFieldsProps) {
  const selected = new Set(selectedUsageTags)

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        用途タグ <span className="text-error">*</span>
      </legend>
      <p className="mb-2 text-xs text-muted">授業用・自習用から選べます（複数選択可）</p>
      <div className="flex flex-wrap gap-2">
        {TEXTBOOK_USAGE_TAGS.map((tag) => (
          <label
            key={tag}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-blue-50"
          >
            <input
              type="checkbox"
              name={`usage_${tag}`}
              defaultChecked={selected.has(tag)}
              className="accent-primary"
            />
            {tag}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
