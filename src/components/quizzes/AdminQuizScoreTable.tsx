'use client'

import { useActionState, useState } from 'react'
import { getPersonName } from '@/lib/auth/display-name'
import { formatQuizScore } from '@/lib/quizzes/chart-data'
import {
  saveQuizResult,
  saveQuizResultsBulk,
  type QuizActionState,
} from '@/app/quizzes/actions'
import { AdminQuizRegisterForm } from '@/components/quizzes/AdminQuizRegisterForm'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type { QuizAssignmentDetail, StudentQuizAssignmentRow } from '@/types/quiz'

const initialState: QuizActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

function QuizScoreRowForm({
  assignmentId,
  studentId,
  studentName,
  maxScore,
  initialScore,
  initialNote,
}: {
  assignmentId: string
  studentId: string
  studentName: string
  maxScore: number
  initialScore: number | null
  initialNote: string
}) {
  const [state, formAction, pending] = useActionState(saveQuizResult, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="studentId" value={studentId} />
      {studentName ? (
        <div className="min-w-[8rem] flex-1">
          <p className="mb-1 text-sm font-medium">{studentName}</p>
          {initialScore != null && (
            <p className="text-xs text-muted">
              現在: {formatQuizScore(initialScore, maxScore)}
            </p>
          )}
        </div>
      ) : null}
      <label className="block w-28">
        <span className="mb-1 block text-xs text-muted">点数</span>
        <input
          type="number"
          name="score"
          min={0}
          max={maxScore}
          step="0.5"
          defaultValue={initialScore ?? ''}
          placeholder={`/${maxScore}`}
          className={fieldClass}
        />
      </label>
      <label className="block min-w-[12rem] flex-1">
        <span className="mb-1 block text-xs text-muted">メモ</span>
        <input name="note" defaultValue={initialNote} className={fieldClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
      >
        {pending ? '保存中…' : '保存'}
      </button>
      {state.error && <p className="w-full text-sm text-error">{state.error}</p>}
      {state.success && <p className="w-full text-sm text-green-700">保存しました</p>}
    </form>
  )
}

export function AdminQuizAssignmentScoreTable({
  detail,
}: {
  detail: QuizAssignmentDetail
}) {
  const [state, formAction, pending] = useActionState(saveQuizResultsBulk, initialState)
  const [rows, setRows] = useState(
    detail.students.map((student) => ({
      studentId: student.student_id,
      score: student.result ? String(student.result.score) : '',
      note: student.result?.note ?? '',
    })),
  )

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-4 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="assignmentId" value={detail.assignment.id} />
        <input type="hidden" name="entriesJson" value={JSON.stringify(rows)} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-2 pr-4 font-medium">生徒</th>
                <th className="pb-2 pr-4 font-medium">点数</th>
                <th className="pb-2 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.students.map((student, index) => (
                <tr key={student.student_id}>
                  <td className="py-3 pr-4 font-medium">{getPersonName(student)}</td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min={0}
                      max={detail.master.max_score}
                      step="0.5"
                      value={rows[index]?.score ?? ''}
                      onChange={(event) => {
                        setRows((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, score: event.target.value }
                              : row,
                          ),
                        )
                      }}
                      className={fieldClass}
                      placeholder={`/${detail.master.max_score}`}
                    />
                  </td>
                  <td className="py-3">
                    <input
                      value={rows[index]?.note ?? ''}
                      onChange={(event) => {
                        setRows((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, note: event.target.value }
                              : row,
                          ),
                        )
                      }}
                      className={fieldClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state.error && <p className="text-sm text-error">{state.error}</p>}
        {state.success && <p className="text-sm text-green-700">一括保存しました</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending ? '保存中…' : '一括保存'}
        </button>
      </form>

      <div className="space-y-4">
        <h3 className="text-sm font-bold">個別保存</h3>
        {detail.students.map((student) => (
          <div key={student.student_id} className="rounded-lg border border-border p-4">
            <QuizScoreRowForm
              assignmentId={detail.assignment.id}
              studentId={student.student_id}
              studentName={getPersonName(student)}
              maxScore={detail.master.max_score}
              initialScore={student.result ? Number(student.result.score) : null}
              initialNote={student.result?.note ?? ''}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminStudentQuizSection({
  studentId,
  studentGroups,
  assignments,
}: {
  studentId: string
  studentGroups: StudentListGroup[]
  assignments: StudentQuizAssignmentRow[]
}) {
  return (
    <div>
      <div className="mb-6">
        <AdminQuizRegisterForm
          studentGroups={studentGroups}
          defaultSelectedStudentIds={[studentId]}
          submitLabel="この生徒に登録"
        />
      </div>
      <AdminStudentQuizScores studentId={studentId} assignments={assignments} />
    </div>
  )
}

export function AdminStudentQuizScores({
  studentId,
  assignments,
}: {
  studentId: string
  assignments: StudentQuizAssignmentRow[]
}) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted">登録されている小テストはありません。</p>
  }

  return (
    <div className="space-y-4">
      {assignments.map(({ assignment, master, result }) => (
        <div key={assignment.id} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{master.title}</p>
              <p className="mt-1 text-xs text-muted">
                実施日: {assignment.scheduled_on}
                {master.subject ? ` / ${master.subject}` : ''}
                {` / 満点 ${master.max_score}`}
              </p>
            </div>
            <a
              href={`/admin/quizzes/assignments/${assignment.id}`}
              className="text-xs text-primary hover:underline"
            >
              実施詳細
            </a>
          </div>
          <QuizScoreRowForm
            assignmentId={assignment.id}
            studentId={studentId}
            studentName=""
            maxScore={master.max_score}
            initialScore={result ? Number(result.score) : null}
            initialNote={result?.note ?? ''}
          />
        </div>
      ))}
    </div>
  )
}
