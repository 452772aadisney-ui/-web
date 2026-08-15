'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteStudyLog, updateStudyLog, type StudyLogActionState } from '@/app/study/actions'
import { filterTextbooksBySubject } from '@/components/textbooks/TextbookManager'
import { formatDuration } from '@/lib/study/chart-data'
import { getJstDateKey } from '@/lib/study/dates'
import { MAX_STUDY_DURATION_MINUTES } from '@/lib/study/validation'
import type { StudyLog } from '@/lib/study/chart-data'
import type { Textbook } from '@/types/textbook'

const initialState: StudyLogActionState = {}

const fieldClass =
  'w-full min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary'

interface StudyLogTableProps {
  logs: StudyLog[]
  profileSubjects: string[]
  textbooks: Textbook[]
  editable?: boolean
  hideStudiedOnColumn?: boolean
  variant?: 'full' | 'compact'
  emptyMessage?: string
}

function formatStudiedOn(date: string): string {
  const [year, month, day] = date.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StudyLogEditPanel({
  log,
  profileSubjects,
  textbooks,
  onCancel,
}: {
  log: StudyLog
  profileSubjects: string[]
  textbooks: Textbook[]
  onCancel: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateStudyLog, initialState)
  const [selectedSubject, setSelectedSubject] = useState(log.subject)
  const todayKey = getJstDateKey()
  const filteredTextbooks = filterTextbooksBySubject(textbooks, selectedSubject)
  const defaultTextbookId =
    log.textbook_id && filteredTextbooks.some((b) => b.id === log.textbook_id)
      ? log.textbook_id
      : filteredTextbooks[0]?.id ?? ''

  useEffect(() => {
    if (state.success) {
      onCancel()
      router.refresh()
    }
  }, [state.success, onCancel, router])

  return (
    <div className="rounded-xl border border-primary/30 bg-blue-50/40 p-4">
      <p className="mb-3 text-sm font-semibold">学習記録を編集</p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="logId" value={log.id} />

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium">学習日</span>
            <input
              type="date"
              name="studiedOn"
              required
              defaultValue={log.studied_on}
              max={todayKey}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium">科目</span>
            <select
              name="subject"
              required
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className={fieldClass}
            >
              {profileSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium">教材</span>
            <select
              name="textbookId"
              required
              key={selectedSubject}
              defaultValue={defaultTextbookId}
              className={fieldClass}
            >
              {filteredTextbooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium">学習時間（分）</span>
            <input
              type="number"
              name="durationMinutes"
              min={1}
              max={MAX_STUDY_DURATION_MINUTES}
              required
              defaultValue={log.duration_minutes}
              className={fieldClass}
            />
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className="mb-1 block text-xs font-medium">内容</span>
            <input
              type="text"
              name="content"
              defaultValue={log.content}
              className={fieldClass}
            />
          </label>
        </div>

        {state.error && <p className="text-sm text-error">{state.error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending || filteredTextbooks.length === 0}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-muted hover:text-foreground"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}

function StudyLogDetailPanel({
  log,
  editable,
  onClose,
  onEdit,
}: {
  log: StudyLog
  editable: boolean
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="mb-3 text-sm font-semibold">学習記録の詳細</p>
      <dl className="space-y-2.5 text-sm">
        <div>
          <dt className="text-xs text-muted">科目</dt>
          <dd className="mt-0.5 font-medium">{log.subject}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">テキスト名</dt>
          <dd className="mt-0.5 font-medium">{log.textbook_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">時間</dt>
          <dd className="mt-0.5 font-medium">{formatDuration(log.duration_minutes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">内容</dt>
          <dd className="mt-0.5">{log.content || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">登録日時</dt>
          <dd className="mt-0.5 text-muted">{formatDateTime(log.created_at)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {editable && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-card"
            >
              編集
            </button>
            <form action={deleteStudyLog}>
              <input type="hidden" name="logId" value={log.id} />
              <button
                type="submit"
                className="rounded-lg border border-red-200 px-4 py-1.5 text-sm font-medium text-error hover:bg-red-50"
              >
                削除
              </button>
            </form>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted hover:text-foreground"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

function CompactStudyLogList({
  logs,
  profileSubjects,
  textbooks,
  editable,
  emptyMessage,
}: StudyLogTableProps) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const detailLog = detailId ? logs.find((log) => log.id === detailId) : null
  const editingLog = editingId ? logs.find((log) => log.id === editingId) : null

  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyMessage}</p>
  }

  function openDetail(logId: string) {
    setEditingId(null)
    setDetailId(logId)
  }

  function closePanels() {
    setDetailId(null)
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      {editingLog && editable && (
        <StudyLogEditPanel
          log={editingLog}
          profileSubjects={profileSubjects}
          textbooks={textbooks}
          onCancel={() => {
            setEditingId(null)
            setDetailId(editingLog.id)
          }}
        />
      )}

      {!editingLog && detailLog && (
        <StudyLogDetailPanel
          log={detailLog}
          editable={Boolean(editable)}
          onClose={closePanels}
          onEdit={() => {
            setEditingId(detailLog.id)
            setDetailId(null)
          }}
        />
      )}

      <div className="divide-y divide-border/60">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`flex items-center gap-3 py-3 ${
              detailId === log.id && !editingId ? 'bg-primary/5 -mx-2 rounded-lg px-2' : ''
            }`}
          >
            <div className="min-w-0 flex-1 grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
              <span className="truncate">{log.subject}</span>
              <span className="truncate" title={log.textbook_name}>
                {log.textbook_name}
              </span>
              <span className="text-right font-medium whitespace-nowrap">
                {formatDuration(log.duration_minutes)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => (detailId === log.id && !editingId ? closePanels() : openDetail(log.id))}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
              aria-expanded={detailId === log.id && !editingId}
            >
              詳細
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StudyLogTable(props: StudyLogTableProps) {
  if (props.variant === 'compact') {
    return <CompactStudyLogList {...props} />
  }

  return <FullStudyLogTable {...props} />
}

function FullStudyLogTable({
  logs,
  profileSubjects,
  textbooks,
  editable = false,
  hideStudiedOnColumn = false,
  emptyMessage = '学習記録はまだありません。',
}: StudyLogTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingLog = editingId ? logs.find((log) => log.id === editingId) : null
  const visibleLogs = editingId ? logs.filter((log) => log.id !== editingId) : logs

  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyMessage}</p>
  }

  return (
    <div className="space-y-4">
      {editingLog && editable && (
        <StudyLogEditPanel
          log={editingLog}
          profileSubjects={profileSubjects}
          textbooks={textbooks}
          onCancel={() => setEditingId(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              {editable && <th className="w-20 px-2 py-2 font-medium">操作</th>}
              {!hideStudiedOnColumn && <th className="w-24 px-2 py-2 font-medium">学習日</th>}
              <th className="w-16 px-2 py-2 font-medium">科目</th>
              <th className="px-2 py-2 font-medium">テキスト</th>
              <th className="px-2 py-2 font-medium">内容</th>
              <th className="w-16 px-2 py-2 font-medium">時間</th>
              <th className="w-28 px-2 py-2 font-medium">登録日時</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log) => (
              <tr key={log.id} className="border-b border-border/60">
                {editable && (
                  <td className="px-2 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(log.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        編集
                      </button>
                      <form action={deleteStudyLog}>
                        <input type="hidden" name="logId" value={log.id} />
                        <button type="submit" className="text-xs text-error hover:underline">
                          削除
                        </button>
                      </form>
                    </div>
                  </td>
                )}
                {!hideStudiedOnColumn && (
                  <td className="px-2 py-3 whitespace-nowrap text-xs">
                    {formatStudiedOn(log.studied_on)}
                  </td>
                )}
                <td className="px-2 py-3 whitespace-nowrap text-xs">{log.subject}</td>
                <td className="max-w-0 truncate px-2 py-3" title={log.textbook_name}>
                  {log.textbook_name}
                </td>
                <td className="max-w-0 truncate px-2 py-3 text-muted" title={log.content || undefined}>
                  {log.content || '—'}
                </td>
                <td className="px-2 py-3 whitespace-nowrap text-xs font-medium">
                  {formatDuration(log.duration_minutes)}
                </td>
                <td className="px-2 py-3 whitespace-nowrap text-xs text-muted">
                  {formatDateTime(log.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
