'use client'

import { getPersonName } from '@/lib/auth/display-name'
import type { StudentListGroup } from '@/lib/tags/grade-order'

interface AdminStudentCheckboxGroupsProps {
  studentGroups: StudentListGroup[]
  selectedIds: Set<string>
  onToggleStudent: (studentId: string) => void
  onToggleGroup: (group: StudentListGroup) => void
  inputName?: string
}

export function AdminStudentCheckboxGroups({
  studentGroups,
  selectedIds,
  onToggleStudent,
  onToggleGroup,
  inputName = 'studentIds',
}: AdminStudentCheckboxGroupsProps) {
  if (studentGroups.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
      {studentGroups.map((group) => {
        const allSelected = group.students.every((student) => selectedIds.has(student.id))
        return (
          <div key={group.gradeLabel}>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleGroup(group)}
                className="accent-primary"
              />
              {group.gradeLabel}
            </label>
            <ul className="space-y-1.5 pl-2">
              {group.students.map((student) => (
                <li key={student.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      {...(inputName ? { name: inputName, value: student.id } : {})}
                      checked={selectedIds.has(student.id)}
                      onChange={() => onToggleStudent(student.id)}
                      className="accent-primary"
                    />
                    {getPersonName(student)}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
