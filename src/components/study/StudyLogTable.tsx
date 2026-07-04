'use client'

import { useActionState, useState } from 'react'
import { deleteStudyLog, updateStudyLog, type StudyLogActionState } from '@/app/study/actions'
import { filterTextbooksBySubject } from '@/components/textbooks/TextbookManager'
import { formatDuration } from '@/lib/study/chart-data'
import type { StudyLog } from '@/lib/study/chart-data'
import type { Textbook } from '@/types/textbook'

const initialState: StudyLogActionState = {}

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary'

interface StudyLogTableProps {
  logs: StudyLog[]
  profileSubjects: string[]
  textbooks: Textbook[]
  editable?: boolean
}

function formatStudiedOn(date: string): string {
  const [year, month, day] = date.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

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

function StudyLogEditRow({
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
  const [state, formAction, pending] = useActionState(updateStudyLog, initialState)
  const [selectedSubject, setSelectedSubject] = useState(log.subject)
  const filteredTextbooks = filterTextbooksBySubject(textbooks, selectedSubject)
  const defaultTextbookId =
    log.textbook_id && filteredTextbooks.some((b) => b.id === log.textbook_id)
      ? log.textbook_id
      : filteredTextbooks[0]?.id ?? ''

  return (
    <tr>
      <td colSpan={editableColSpan(true)} className="bg-blue-50/40 px-3 py-4">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="logId" value={log.id} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">学習日</span>
              <input
                type="date"
                name="studiedOn"
                required
                defaultValue={log.studied_on}
                className={fieldClass}
              />
            </label>
            <label className="block">
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
            <label className="block">
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
            <label className="block">
              <span className="mb-1 block text-xs font-medium">学習時間（分）</span>
              <input
                type="number"
                name="durationMinutes"
                min={1}
                required
                defaultValue={log.duration_minutes}
                className={fieldClass}
              />
            </label>
            <label className="block sm:col-span-2">
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
          {state.success && <p className="text-sm text-green-700">更新しました</p>}

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
      </td>
    </tr>
  )
}

function editableColSpan(editable: boolean) {
  return editable ? 7 : 6
}

export function StudyLogTable({
  logs,
  profileSubjects,
  textbooks,
  editable = false,
}: StudyLogTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">学習記録はまだありません。</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="px-3 py-2 font-medium">学習日</th>
            <th className="px-3 py-2 font-medium">科目</th>
            <th className="px-3 py-2 font-medium">テキスト</th>
            <th className="px-3 py-2 font-medium">内容</th>
            <th className="px-3 py-2 font-medium">時間</th>
            <th className="px-3 py-2 font-medium">登録日時</th>
            {editable && <th className="px-3 py-2 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) =>
            editingId === log.id && editable ? (
              <StudyLogEditRow
                key={log.id}
                log={log}
                profileSubjects={profileSubjects}
                textbooks={textbooks}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <tr key={log.id} className="border-b border-border/60">
                <td className="px-3 py-3 whitespace-nowrap">{formatStudiedOn(log.studied_on)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{log.subject}</td>
                <td className="px-3 py-3">{log.textbook_name}</td>
                <td className="px-3 py-3 text-muted">{log.content || '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">
                  {formatDuration(log.duration_minutes)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">
                  {formatDateTime(log.created_at)}
                </td>
                {editable && (
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex gap-3">
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
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
