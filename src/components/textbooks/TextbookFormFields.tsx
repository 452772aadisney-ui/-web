import { TEXTBOOK_USAGE_TAGS } from '@/lib/constants/textbook-tags'

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

interface SubjectTagFieldsProps {
  profileSubjects: string[]
  selectedSubjects?: string[]
}

export function SubjectTagFields({
  profileSubjects,
  selectedSubjects = [],
}: SubjectTagFieldsProps) {
  const selected = new Set(selectedSubjects)

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        科目タグ <span className="text-error">*</span>
      </legend>
      <p className="mb-2 text-xs text-muted">プロフィールで選択中の科目から選べます</p>
      <div className="flex flex-wrap gap-2">
        {profileSubjects.map((subject) => (
          <label
            key={subject}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-blue-50"
          >
            <input
              type="checkbox"
              name={`subject_${subject}`}
              defaultChecked={selected.has(subject)}
              className="accent-primary"
            />
            {subject}
          </label>
        ))}
      </div>
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
