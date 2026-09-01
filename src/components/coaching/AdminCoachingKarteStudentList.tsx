'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { getPersonName } from '@/lib/auth/display-name'
import type { StudentListGroup } from '@/lib/tags/grade-order'

interface AdminCoachingKarteStudentListProps {
  groups: StudentListGroup[]
}

export function AdminCoachingKarteStudentList({ groups }: AdminCoachingKarteStudentListProps) {
  const [query, setQuery] = useState('')
  const [hiddenGrades, setHiddenGrades] = useState<Set<string>>(new Set())

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return groups
      .map((group) => {
        const students = normalized
          ? group.students.filter((student) => {
              const name = getPersonName(student).toLowerCase()
              const code = (student.student_code ?? '').toLowerCase()
              return name.includes(normalized) || code.includes(normalized)
            })
          : group.students

        return { ...group, students }
      })
      .filter((group) => group.students.length > 0)
  }, [groups, query])

  function toggleGrade(gradeLabel: string) {
    setHiddenGrades((current) => {
      const next = new Set(current)
      if (next.has(gradeLabel)) next.delete(gradeLabel)
      else next.add(gradeLabel)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="生徒名・生徒番号で検索"
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {filteredGroups.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          該当する生徒が見つかりませんでした。
        </p>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isVisible = !hiddenGrades.has(group.gradeLabel)

            return (
              <section key={group.gradeLabel} className="rounded-xl border border-border bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGrade(group.gradeLabel)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-background"
                  aria-expanded={isVisible}
                >
                  <span className="text-sm font-bold">{group.gradeLabel}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span>{group.students.length}名</span>
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {isVisible ? '非表示' : '表示'}
                    </span>
                  </span>
                </button>

                {isVisible && (
                  <ul className="divide-y divide-border border-t border-border">
                    {group.students.map((student) => (
                      <li key={student.id}>
                        <Link
                          href={`/admin/coaching/karte/${student.id}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-background"
                        >
                          <div>
                            <p className="font-medium">{getPersonName(student)}</p>
                            {student.student_code && (
                              <p className="text-xs text-muted">生徒番号: {student.student_code}</p>
                            )}
                          </div>
                          <span className="text-muted" aria-hidden>
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
