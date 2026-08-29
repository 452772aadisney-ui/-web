'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AdminBookshelfEditModal,
  type AdminEditingStudent,
} from '@/components/textbooks/AdminBookshelfEditModal'
import { TextbookCoverImage } from '@/components/textbooks/TextbookCoverImage'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type { AdminBookshelfOverview, AdminBookshelfStudentEntry } from '@/types/textbook'

interface AdminStudentRegisteredEntriesProps {
  overview: AdminBookshelfOverview
  studentGroups: StudentListGroup[]
}

function StudentEntryCard({
  item,
  onEdit,
}: {
  item: AdminBookshelfStudentEntry
  onEdit: () => void
}) {
  const displayTags =
    item.detail_tags && item.detail_tags.length > 0
      ? item.detail_tags.join('・')
      : item.subjects.join('・')

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <TextbookCoverImage name={item.name} coverUrl={null} className="mx-auto h-28 w-20" />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <span className="inline-block w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          生徒登録
        </span>
        <h3 className="mt-1 line-clamp-3 text-xs font-bold leading-snug">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-[10px] text-muted">{displayTags}</p>
        <p className="mt-1 text-[10px] text-muted">利用中: {item.users.length}人</p>
        <button
          type="button"
          onClick={onEdit}
          className="mt-auto w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-card"
        >
          編集
        </button>
      </div>
    </article>
  )
}

export function AdminStudentRegisteredEntries({
  overview,
  studentGroups,
}: AdminStudentRegisteredEntriesProps) {
  const router = useRouter()
  const [editingItem, setEditingItem] = useState<AdminEditingStudent | null>(null)

  const entries = useMemo(
    () => [...overview.studentEntries].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [overview.studentEntries],
  )

  function handleCloseModal() {
    setEditingItem(null)
    router.refresh()
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
        生徒が独自に登録した参考書はまだありません。
      </p>
    )
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {entries.map((item) => (
          <li key={item.key} className="min-w-0">
            <StudentEntryCard
              item={item}
              onEdit={() => setEditingItem({ ...item, kind: 'student' })}
            />
          </li>
        ))}
      </ul>

      {editingItem && (
        <AdminBookshelfEditModal
          item={editingItem}
          studentGroups={studentGroups}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
