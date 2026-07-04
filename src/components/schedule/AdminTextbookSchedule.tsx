'use client'

import { useEffect, useState } from 'react'
import { loadTextbooksForAdmin } from '@/app/textbooks/actions'
import { getPersonName } from '@/lib/auth/display-name'
import { TextbookManager } from '@/components/textbooks/TextbookManager'
import type { Textbook } from '@/types/textbook'

interface AdminTextbookScheduleProps {
  students: Array<{
    id: string
    full_name: string
    display_name: string
    subjects: string[]
  }>
}

export function AdminTextbookSchedule({ students }: AdminTextbookScheduleProps) {
  const [selectedId, setSelectedId] = useState(students[0]?.id ?? '')
  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [loading, setLoading] = useState(false)
  const selected = students.find((s) => s.id === selectedId)

  useEffect(() => {
    if (!selectedId) return

    let cancelled = false
    setLoading(true)

    void loadTextbooksForAdmin(selectedId).then((data) => {
      if (!cancelled) {
        setTextbooks(data as Textbook[])
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (students.length === 0) {
    return <p className="text-sm text-muted">登録されている生徒がいません。</p>
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-medium">生徒を選択</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {getPersonName(s)}
            </option>
          ))}
        </select>
      </label>

      {loading && <p className="text-sm text-muted">読み込み中…</p>}

      {selected && !loading && (
        <TextbookManager
          studentId={selected.id}
          profileSubjects={selected.subjects ?? []}
          textbooks={textbooks}
        />
      )}

      <p className="text-xs text-muted">
        登録した参考書の開始日・終了予定日は、生徒のカレンダーに自動で表示されます。
      </p>
    </div>
  )
}
