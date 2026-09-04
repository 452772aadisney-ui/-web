'use client'

import { useActionState, useState } from 'react'
import { getPersonName } from '@/lib/auth/display-name'
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  type AnnouncementActionState,
} from '@/app/announcements/actions'
import {
  AnnouncementTargetFields,
  fieldClass,
} from '@/components/announcements/AnnouncementTargetFields'
import { useActionToast } from '@/hooks/useActionToast'
import {
  formatAnnouncementTargetSummary,
  resolveAnnouncementAudience,
  buildProfileTagMap,
} from '@/lib/announcements/audience'
import type { AnnouncementRead, AnnouncementWithTargets } from '@/types/announcement'
import type { StudentTag } from '@/types/tag'

const initialState: AnnouncementActionState = {}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AnnouncementForm({
  announcement,
  allTags,
  students,
  onCancel,
}: {
  announcement?: AnnouncementWithTargets
  allTags: StudentTag[]
  students: Array<{ id: string; full_name: string; display_name: string }>
  onCancel?: () => void
}) {
  const action = announcement ? updateAnnouncement : createAnnouncement
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, {
    successMessage: announcement ? 'お知らせを更新しました' : 'お知らせを投稿しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {announcement && <input type="hidden" name="id" value={announcement.id} />}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">タイトル *</span>
        <input name="title" required defaultValue={announcement?.title ?? ''} className={fieldClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">本文 *</span>
        <textarea
          name="body"
          required
          rows={6}
          defaultValue={announcement?.body ?? ''}
          className={fieldClass}
        />
      </label>
      <AnnouncementTargetFields
        allTags={allTags}
        students={students}
        announcement={announcement}
      />
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : announcement ? '更新' : '投稿'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-muted">
            キャンセル
          </button>
        )}
      </div>
    </form>
  )
}

function ReadStatusPanel({
  audience,
  reads,
}: {
  audience: Array<{ id: string; full_name: string; display_name: string }>
  reads: AnnouncementRead[]
}) {
  const readMap = new Map(reads.map((r) => [r.student_id, r.read_at]))
  const readStudents = audience.filter((s) => readMap.has(s.id))
  const unreadStudents = audience.filter((s) => !readMap.has(s.id))

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-background p-4">
        <h4 className="text-sm font-semibold text-green-800">既読 ({readStudents.length})</h4>
        {readStudents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">まだ既読の生徒はいません。</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {readStudents.map((s) => (
              <li key={s.id}>
                {getPersonName(s)}
                <span className="ml-2 text-xs text-muted">
                  {formatDateTime(readMap.get(s.id)!)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <h4 className="text-sm font-semibold text-red-800">未読 ({unreadStudents.length})</h4>
        {unreadStudents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">配信先は全員既読です。</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {unreadStudents.map((s) => (
              <li key={s.id}>{getPersonName(s)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

interface AdminAnnouncementManagerProps {
  announcements: AnnouncementWithTargets[]
  students: Array<{ id: string; full_name: string; display_name: string }>
  reads: AnnouncementRead[]
  allTags: StudentTag[]
  profileTagAssignments: Array<{ profile_id: string; tag_id: string }>
}

export function AdminAnnouncementManager({
  announcements,
  students,
  reads,
  allTags,
  profileTagAssignments,
}: AdminAnnouncementManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const profileTagMap = buildProfileTagMap(profileTagAssignments)

  const readsByAnnouncement = reads.reduce<Map<string, AnnouncementRead[]>>((map, read) => {
    const list = map.get(read.announcement_id) ?? []
    list.push(read)
    map.set(read.announcement_id, list)
    return map
  }, new Map())

  return (
    <div className="space-y-4">
      <AnnouncementForm allTags={allTags} students={students} />
      {announcements.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {announcements.map((announcement) => {
            const audience = resolveAnnouncementAudience(announcement, students, profileTagMap)
            const announcementReads = (readsByAnnouncement.get(announcement.id) ?? []).filter((r) =>
              audience.some((s) => s.id === r.student_id),
            )
            const readCount = announcementReads.length
            const unreadCount = audience.length - readCount
            const targetSummary = formatAnnouncementTargetSummary(announcement, allTags, students)

            return (
              <li key={announcement.id} className="p-4">
                {editingId === announcement.id ? (
                  <AnnouncementForm
                    announcement={announcement}
                    allTags={allTags}
                    students={students}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">{announcement.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted">{announcement.body}</p>
                        <p className="mt-2 text-xs text-muted">
                          配信先: {targetSummary}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          投稿: {formatDateTime(announcement.created_at)}
                          {' / '}
                          対象 {audience.length} 人・既読 {readCount} 人・未読 {unreadCount} 人
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === announcement.id ? null : announcement.id)
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          {expandedId === announcement.id ? '既読状況を閉じる' : '既読状況を見る'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(announcement.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          編集
                        </button>
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="id" value={announcement.id} />
                          <button type="submit" className="text-xs text-error hover:underline">
                            削除
                          </button>
                        </form>
                      </div>
                    </div>
                    {expandedId === announcement.id && (
                      <ReadStatusPanel audience={audience} reads={announcementReads} />
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
