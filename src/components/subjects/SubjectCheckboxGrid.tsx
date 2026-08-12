import { SUBJECT_TAG_CELL_WIDTH } from '@/lib/constants/subjects'

export const subjectCheckboxGridClass = `grid gap-2 justify-start [grid-template-columns:repeat(auto-fill,minmax(${SUBJECT_TAG_CELL_WIDTH},${SUBJECT_TAG_CELL_WIDTH}))]`

export const subjectCheckboxLabelClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-background has-checked:border-primary has-checked:bg-blue-50'

export const subjectCheckboxInputClass = 'h-4 w-4 shrink-0 accent-primary'

interface SubjectCheckboxGridProps {
  subjects: readonly string[]
  selectedSubjects?: Iterable<string>
  namePrefix?: string
}

export function SubjectCheckboxGrid({
  subjects,
  selectedSubjects = [],
  namePrefix = 'subject_',
}: SubjectCheckboxGridProps) {
  const selected = new Set(selectedSubjects)

  return (
    <div className={subjectCheckboxGridClass}>
      {subjects.map((subject) => (
        <label key={subject} className={subjectCheckboxLabelClass}>
          <input
            type="checkbox"
            name={`${namePrefix}${subject}`}
            defaultChecked={selected.has(subject)}
            className={subjectCheckboxInputClass}
          />
          <span className="min-w-0 flex-1 truncate">{subject}</span>
        </label>
      ))}
    </div>
  )
}
