'use client'

import { getPersonName } from '@/lib/auth/display-name'

interface ScheduleStudentPickerProps {
  students: Array<{ id: string; full_name: string; display_name: string }>
  selectedStudentIds?: string[]
}

export function ScheduleStudentPicker({
  students,
  selectedStudentIds = [],
}: ScheduleStudentPickerProps) {
  const selected = new Set(selectedStudentIds)

  if (students.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-background p-4">
      <legend className="px-1 text-sm font-medium">登録する生徒 *</legend>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {students.map((student) => (
          <label key={student.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="targetStudentIds"
              value={student.id}
              defaultChecked={selected.has(student.id)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            {getPersonName(student)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">1名以上の生徒を選択してください。</p>
    </fieldset>
  )
}

export function formatStudentTargets(
  targetAll: boolean,
  targetStudentIds: string[],
  students: Array<{ id: string; full_name: string; display_name: string }>,
): string {
  if (targetAll) return '全員'
  if (targetStudentIds.length === 0) return '未設定'

  const names = targetStudentIds
    .map((id) => {
      const student = students.find((s) => s.id === id)
      return student ? getPersonName(student) : null
    })
    .filter(Boolean)

  return names.join('、')
}
