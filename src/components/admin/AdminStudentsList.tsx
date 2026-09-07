'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatLastAccessedAt } from '@/lib/auth/last-access'
import { getPersonName } from '@/lib/auth/display-name'
import type { PushRegistrationView } from '@/lib/admin/push-registration'
import type { StudentListGroup } from '@/lib/tags/grade-order'

interface AdminStudentsListProps {
  groups: StudentListGroup[]
  registrationByStudentId?: Record<string, PushRegistrationView>
}

function PushRegistrationBadge({ view }: { view: PushRegistrationView }) {
  const tone =
    view.status === 'registered'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : view.status === 'unregistered'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-border bg-background text-muted'

  return (
    <span
      className={`inline-flex max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {view.label}
    </span>
  )
}

export function AdminStudentsList({
  groups,
  registrationByStudentId = {},
}: AdminStudentsListProps) {
  const [hiddenGrades, setHiddenGrades] = useState<Set<string>>(new Set())

  function toggleGrade(gradeLabel: string) {
    setHiddenGrades((current) => {
      const next = new Set(current)
      if (next.has(gradeLabel)) {
        next.delete(gradeLabel)
      } else {
        next.add(gradeLabel)
      }
      return next
    })
  }

  return (
    <div className="mt-6 space-y-6">
      {groups.map((group) => {
        const isVisible = !hiddenGrades.has(group.gradeLabel)

        return (
          <section key={group.gradeLabel} className="rounded-xl border border-border">
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
              <div className="border-t border-border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.students.map((student) => {
                    const registration = registrationByStudentId[student.id]

                    return (
                      <Link
                        key={student.id}
                        href={`/admin/students/${student.id}`}
                        className="flex h-full flex-col justify-between rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm"
                      >
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-medium">{getPersonName(student)}</p>
                            {registration && <PushRegistrationBadge view={registration} />}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted">{student.email}</p>
                          <p className="mt-2 text-xs text-muted">
                            最終アクセス: {formatLastAccessedAt(student.last_accessed_at)}
                          </p>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          {student.student_code ? (
                            <p className="font-mono text-xs text-muted">{student.student_code}</p>
                          ) : (
                            <span />
                          )}
                          <span className="text-sm text-primary">詳細 →</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
