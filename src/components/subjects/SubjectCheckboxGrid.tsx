/** 科目タグ1件の幅（最長の「数学IIBC」+ チェックボックス分） */
export const subjectCheckboxLabelClass =
  'flex w-[8.25rem] shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-background has-checked:border-primary has-checked:bg-blue-50'

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
    <div className="flex flex-wrap gap-2">
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
