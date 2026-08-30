'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { getPersonName } from '@/lib/auth/display-name'
interface AdminCoachingKarteStudentListProps {
  students: Array<{
    id: string
    full_name: string
    display_name: string
    student_code: string | null
  }>
}

export function AdminCoachingKarteStudentList({ students }: AdminCoachingKarteStudentListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return students

    return students.filter((student) => {
      const name = getPersonName(student).toLowerCase()
      const code = (student.student_code ?? '').toLowerCase()
      return name.includes(normalized) || code.includes(normalized)
    })
  }, [query, students])

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="生徒名・生徒番号で検索"
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          該当する生徒が見つかりませんでした。
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
          {filtered.map((student) => (
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
    </div>
  )
}
