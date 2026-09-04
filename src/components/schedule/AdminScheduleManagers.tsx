'use client'

import { useActionState, useState } from 'react'
import {
  createApplicationTask,
  createExamSchedule,
  createHomeworkTask,
  deleteApplicationTask,
  deleteExamSchedule,
  deleteHomeworkTask,
  updateApplicationTask,
  updateExamSchedule,
  updateHomeworkTask,
  type ScheduleActionState,
} from '@/app/schedule/actions'
import {
  formatStudentTargets,
  ScheduleStudentPicker,
} from '@/components/schedule/ScheduleStudentPicker'
import { HomeworkCompletionOverview } from '@/components/todo/AdminTodoTables'
import { useActionToast } from '@/hooks/useActionToast'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type {
  ExamScheduleWithTargets,
  HomeworkTaskWithTargets,
} from '@/types/schedule'
import type { ApplicationTaskWithTargets, HomeworkCompletion } from '@/types/todo'

const initialState: ScheduleActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

type StudentOption = { id: string; full_name: string; display_name: string }

function formatDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function QuizForm({
  exam,
  students,
  onCancel,
}: {
  exam?: ExamScheduleWithTargets
  students: StudentOption[]
  onCancel?: () => void
}) {
  const action = exam ? updateExamSchedule : createExamSchedule
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, {
    successMessage: exam ? '小テスト予定を更新しました' : '小テスト予定を登録しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {exam && <input type="hidden" name="id" value={exam.id} />}
      <input type="hidden" name="examType" value="quiz" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required defaultValue={exam?.title ?? ''} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">教科</span>
          <select name="subject" defaultValue={exam?.subject ?? ''} className={fieldClass}>
            <option value="">—</option>
            {EXAM_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">実施日 *</span>
          <input type="date" name="scheduledOn" required defaultValue={exam?.scheduled_on ?? ''} className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">メモ</span>
          <input name="note" defaultValue={exam?.note ?? ''} className={fieldClass} />
        </label>
      </div>
      <ScheduleStudentPicker
        students={students}
        selectedStudentIds={exam?.target_all ? [] : exam?.target_student_ids}
      />
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? '保存中…' : exam ? '更新' : '登録'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-muted">キャンセル</button>}
      </div>
    </form>
  )
}

function MockExamForm({
  exam,
  students,
  onCancel,
}: {
  exam?: ExamScheduleWithTargets
  students: StudentOption[]
  onCancel?: () => void
}) {
  const action = exam ? updateExamSchedule : createExamSchedule
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, {
    successMessage: exam ? '模試予定を更新しました' : '模試予定を登録しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {exam && <input type="hidden" name="id" value={exam.id} />}
      <input type="hidden" name="examType" value="mock_exam" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required defaultValue={exam?.title ?? ''} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">教科</span>
          <select name="subject" defaultValue={exam?.subject ?? ''} className={fieldClass}>
            <option value="">—</option>
            {EXAM_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">受験日 *</span>
          <input type="date" name="scheduledOn" required defaultValue={exam?.scheduled_on ?? ''} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">返却日 *</span>
          <input type="date" name="returnOn" required defaultValue={exam?.return_on ?? ''} className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">メモ</span>
          <input name="note" defaultValue={exam?.note ?? ''} className={fieldClass} />
        </label>
      </div>
      <ScheduleStudentPicker
        students={students}
        selectedStudentIds={exam?.target_all ? [] : exam?.target_student_ids}
      />
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? '保存中…' : exam ? '更新' : '登録'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-muted">キャンセル</button>}
      </div>
    </form>
  )
}

function HomeworkForm({
  task,
  students,
  onCancel,
}: {
  task?: HomeworkTaskWithTargets
  students: StudentOption[]
  onCancel?: () => void
}) {
  const action = task ? updateHomeworkTask : createHomeworkTask
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, {
    successMessage: task ? '宿題を更新しました' : '宿題を登録しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {task && <input type="hidden" name="id" value={task.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required defaultValue={task?.title ?? ''} className={fieldClass} placeholder="例: 数学 演習問題 Lv.3" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">教科 *</span>
          <select name="subject" required defaultValue={task?.subject ?? ''} className={fieldClass}>
            <option value="" disabled>選択</option>
            {EXAM_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">期日 *</span>
          <input type="date" name="dueDate" required defaultValue={task?.due_date ?? ''} className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">内容</span>
          <input name="description" defaultValue={task?.description ?? ''} className={fieldClass} />
        </label>
      </div>
      <ScheduleStudentPicker
        students={students}
        selectedStudentIds={task?.target_all ? [] : task?.target_student_ids}
      />
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? '保存中…' : task ? '更新' : '登録'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-muted">キャンセル</button>}
      </div>
    </form>
  )
}

function ApplicationForm({
  task,
  students,
  onCancel,
}: {
  task?: ApplicationTaskWithTargets
  students: StudentOption[]
  onCancel?: () => void
}) {
  const action = task ? updateApplicationTask : createApplicationTask
  const [state, formAction, pending] = useActionState(action, initialState)

  useActionToast(state, {
    successMessage: task ? '出願タスクを更新しました' : '出願タスクを登録しました',
    pending,
  })

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-background p-4">
      {task && <input type="hidden" name="id" value={task.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">タイトル *</span>
          <input name="title" required defaultValue={task?.title ?? ''} className={fieldClass} placeholder="例: 共通テスト出願" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">期日 *</span>
          <input type="date" name="dueDate" required defaultValue={task?.due_date ?? ''} className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">内容</span>
          <input name="description" defaultValue={task?.description ?? ''} className={fieldClass} />
        </label>
      </div>
      <ScheduleStudentPicker
        students={students}
        selectedStudentIds={task?.target_all ? [] : task?.target_student_ids}
      />
      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? '保存中…' : task ? '更新' : '登録'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-muted">キャンセル</button>}
      </div>
    </form>
  )
}

export function QuizScheduleManager({
  exams,
  students,
}: {
  exams: ExamScheduleWithTargets[]
  students: StudentOption[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <QuizForm students={students} />
      {exams.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {exams.map((exam) => (
            <li key={exam.id} className="p-4">
              {editingId === exam.id ? (
                <QuizForm exam={exam} students={students} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{exam.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {exam.subject ? `${exam.subject} / ` : ''}実施日: {formatDate(exam.scheduled_on)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      対象: {formatStudentTargets(exam.target_all, exam.target_student_ids, students)}
                    </p>
                    {exam.note && <p className="mt-1 text-xs text-muted">{exam.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setEditingId(exam.id)} className="text-xs text-primary hover:underline">編集</button>
                    <form action={deleteExamSchedule}>
                      <input type="hidden" name="id" value={exam.id} />
                      <button type="submit" className="text-xs text-error hover:underline">削除</button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MockExamScheduleManager({
  exams,
  students,
}: {
  exams: ExamScheduleWithTargets[]
  students: StudentOption[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <MockExamForm students={students} />
      {exams.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {exams.map((exam) => (
            <li key={exam.id} className="p-4">
              {editingId === exam.id ? (
                <MockExamForm exam={exam} students={students} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{exam.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {exam.subject ? `${exam.subject} / ` : ''}
                      受験: {formatDate(exam.scheduled_on)}
                      {exam.return_on ? ` / 返却: ${formatDate(exam.return_on)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      対象: {formatStudentTargets(exam.target_all, exam.target_student_ids, students)}
                    </p>
                    {exam.note && <p className="mt-1 text-xs text-muted">{exam.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setEditingId(exam.id)} className="text-xs text-primary hover:underline">編集</button>
                    <form action={deleteExamSchedule}>
                      <input type="hidden" name="id" value={exam.id} />
                      <button type="submit" className="text-xs text-error hover:underline">削除</button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function HomeworkTaskManager({
  tasks,
  students = [],
  completions = [],
}: {
  tasks: HomeworkTaskWithTargets[]
  students?: StudentOption[]
  completions?: HomeworkCompletion[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <HomeworkForm students={students} />
      {tasks.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tasks.map((task) => (
            <li key={task.id} className="p-4">
              {editingId === task.id ? (
                <HomeworkForm task={task} students={students} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-muted">{task.subject} / 期日: {formatDate(task.due_date)}</p>
                    <p className="mt-1 text-xs text-muted">
                      対象: {formatStudentTargets(task.target_all, task.target_student_ids, students)}
                    </p>
                    {task.description && <p className="mt-1 text-xs text-muted">{task.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setEditingId(task.id)} className="text-xs text-primary hover:underline">編集</button>
                    <form action={deleteHomeworkTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <button type="submit" className="text-xs text-error hover:underline">削除</button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {students.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold">宿題の完了状況（未完了の生徒）</h3>
          <HomeworkCompletionOverview
            tasks={tasks}
            students={students}
            completions={completions}
          />
        </>
      )}
    </div>
  )
}

export function ApplicationTaskManager({
  tasks,
  students,
}: {
  tasks: ApplicationTaskWithTargets[]
  students: StudentOption[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <ApplicationForm students={students} />
      {tasks.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tasks.map((task) => (
            <li key={task.id} className="p-4">
              {editingId === task.id ? (
                <ApplicationForm task={task} students={students} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="mt-1 text-sm text-muted">期日: {formatDate(task.due_date)}</p>
                    <p className="mt-1 text-xs text-muted">
                      対象: {formatStudentTargets(task.target_all, task.target_student_ids, students)}
                    </p>
                    {task.description && <p className="mt-1 text-xs text-muted">{task.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setEditingId(task.id)} className="text-xs text-primary hover:underline">編集</button>
                    <form action={deleteApplicationTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <button type="submit" className="text-xs text-error hover:underline">削除</button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
