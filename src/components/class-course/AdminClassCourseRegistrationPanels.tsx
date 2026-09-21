'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  CLASS_COURSE_SUBJECTS,
  CLASS_COURSE_SUBJECT_LABELS,
  CLASS_COURSE_TERM_LABELS,
  CLASS_COURSE_TERMS,
  CLASS_COURSE_TRACK_LABELS,
  type ClassCourseSubject,
  type ClassCourseTerm,
  type ClassCourseTrack,
} from '@/lib/class-course/catalog'
import {
  addStudentsToExistingCourses,
  createClassCoursesWithAssignments,
  listCourseUnitsForScope,
} from '@/app/class-course/actions'

type StudentOption = { id: string; label: string }
type UnitOption = { id: string; seqNo: number; displayName: string }

export function AdminClassCourseRegistrationPanels(props: {
  defaultAcademicYear: number
  students: StudentOption[]
}) {
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="new-courses-heading">
        <h2 id="new-courses-heading" className="text-lg font-bold">
          新しい授業を追加
        </h2>
        <NewCoursesForm
          defaultAcademicYear={props.defaultAcademicYear}
          students={props.students}
        />
      </section>

      <section className="space-y-4" aria-labelledby="add-students-heading">
        <h2 id="add-students-heading" className="text-lg font-bold">
          既存の授業に生徒を追加
        </h2>
        <AddStudentsForm
          defaultAcademicYear={props.defaultAcademicYear}
          students={props.students}
        />
      </section>
    </div>
  )
}

function ScopeFields(props: {
  academicYear: number
  setAcademicYear: (n: number) => void
  term: ClassCourseTerm
  setTerm: (t: ClassCourseTerm) => void
  subject: ClassCourseSubject
  setSubject: (s: ClassCourseSubject) => void
  track: ClassCourseTrack
  setTrack: (t: ClassCourseTrack) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium">年度</span>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={props.academicYear}
          onChange={(e) => props.setAcademicYear(Number(e.target.value))}
          min={2000}
          max={2100}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">時期</span>
        <select
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={props.term}
          onChange={(e) => props.setTerm(e.target.value as ClassCourseTerm)}
        >
          {CLASS_COURSE_TERMS.map((term) => (
            <option key={term} value={term}>
              {CLASS_COURSE_TERM_LABELS[term]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">科目</span>
        <select
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={props.subject}
          onChange={(e) => props.setSubject(e.target.value as ClassCourseSubject)}
        >
          {CLASS_COURSE_SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {CLASS_COURSE_SUBJECT_LABELS[subject]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium">枠</span>
        <select
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          value={props.track}
          onChange={(e) => props.setTrack(e.target.value as ClassCourseTrack)}
        >
          <option value="regular">{CLASS_COURSE_TRACK_LABELS.regular}</option>
          <option value="addon">{CLASS_COURSE_TRACK_LABELS.addon}</option>
        </select>
      </label>
    </div>
  )
}

function StudentChecklist(props: {
  students: StudentOption[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  if (props.students.length === 0) {
    return <p className="text-sm text-muted">選択できる既卒生がいません。</p>
  }
  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
      {props.students.map((student) => (
        <li key={student.id}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.selected.has(student.id)}
              onChange={() => props.onToggle(student.id)}
            />
            <span>{student.label}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function NewCoursesForm(props: {
  defaultAcademicYear: number
  students: StudentOption[]
}) {
  const [academicYear, setAcademicYear] = useState(props.defaultAcademicYear)
  const [term, setTerm] = useState<ClassCourseTerm>('second_half')
  const [subject, setSubject] = useState<ClassCourseSubject>('english_reading')
  const [track, setTrack] = useState<ClassCourseTrack>('regular')
  const [mode, setMode] = useState<'append' | 'custom'>('append')
  const [count, setCount] = useState(1)
  const [startSeq, setStartSeq] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [popup, setPopup] = useState<{ title: string; body: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        const fd = new FormData()
        fd.set('academicYear', String(academicYear))
        fd.set('term', term)
        fd.set('subject', subject)
        fd.set('track', track)
        fd.set('numberingMode', mode)
        fd.set('count', String(count))
        if (mode === 'custom') fd.set('startSeq', String(startSeq))
        for (const id of selected) fd.append('studentIds', id)
        startTransition(async () => {
          const result = await createClassCoursesWithAssignments(fd)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setPopup({ title: result.popupTitle, body: result.popupBody })
          setSelected(new Set())
        })
      }}
    >
      <ScopeFields
        academicYear={academicYear}
        setAcademicYear={setAcademicYear}
        term={term}
        setTerm={setTerm}
        subject={subject}
        setSubject={setSubject}
        track={track}
        setTrack={setTrack}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">番号</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === 'append'}
            onChange={() => setMode('append')}
          />
          続きの番号から登録
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === 'custom'}
            onChange={() => setMode('custom')}
          />
          任意の番号から登録
        </label>
        {mode === 'custom' ? (
          <label className="block text-sm">
            <span className="font-medium">開始番号</span>
            <input
              type="number"
              min={1}
              max={99}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={startSeq}
              onChange={(e) => setStartSeq(Number(e.target.value))}
              required
            />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium">追加回数</span>
          <input
            type="number"
            min={1}
            max={50}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            required
          />
        </label>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium">対象生徒</p>
        <StudentChecklist
          students={props.students}
          selected={selected}
          onToggle={toggle}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '登録中…' : '新しい授業を追加'}
      </button>

      {popup ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-base font-bold">{popup.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm">{popup.body}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
              onClick={() => setPopup(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </form>
  )
}

function AddStudentsForm(props: {
  defaultAcademicYear: number
  students: StudentOption[]
}) {
  const [academicYear, setAcademicYear] = useState(props.defaultAcademicYear)
  const [term, setTerm] = useState<ClassCourseTerm>('second_half')
  const [subject, setSubject] = useState<ClassCourseSubject>('english_reading')
  const [track, setTrack] = useState<ClassCourseTrack>('regular')
  const [units, setUnits] = useState<UnitOption[]>([])
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set())
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const scopeKey = useMemo(
    () => `${academicYear}:${term}:${subject}:${track}`,
    [academicYear, term, subject, track],
  )

  function toggleUnit(id: string) {
    setSelectedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setMessage(null)
        const fd = new FormData()
        for (const id of selectedUnits) fd.append('unitIds', id)
        for (const id of selectedStudents) fd.append('studentIds', id)
        startTransition(async () => {
          const result = await addStudentsToExistingCourses(fd)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setMessage(
            `追加 ${result.inserted} 件` +
              (result.skipped > 0 ? `（既に割当済み ${result.skipped} 件はスキップ）` : ''),
          )
        })
      }}
    >
      <ScopeFields
        academicYear={academicYear}
        setAcademicYear={(n) => {
          setAcademicYear(n)
          setUnits([])
          setSelectedUnits(new Set())
        }}
        term={term}
        setTerm={(t) => {
          setTerm(t)
          setUnits([])
          setSelectedUnits(new Set())
        }}
        subject={subject}
        setSubject={(s) => {
          setSubject(s)
          setUnits([])
          setSelectedUnits(new Set())
        }}
        track={track}
        setTrack={(t) => {
          setTrack(t)
          setUnits([])
          setSelectedUnits(new Set())
        }}
      />

      <button
        type="button"
        className="rounded-lg border border-border px-3 py-2 text-sm"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const rows = await listCourseUnitsForScope({
              academicYear,
              term,
              subject,
              track,
            })
            setUnits(rows)
            setSelectedUnits(new Set())
            if (rows.length === 0) {
              setMessage(`この範囲（${scopeKey}）に登録済み授業はありません。`)
            } else {
              setMessage(null)
            }
          })
        }}
      >
        登録済み授業を表示
      </button>

      {units.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
          {units.map((unit) => (
            <li key={unit.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedUnits.has(unit.id)}
                  onChange={() => toggleUnit(unit.id)}
                />
                <span>{unit.displayName}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">追加する生徒</p>
        <StudentChecklist
          students={props.students}
          selected={selectedStudents}
          onToggle={toggleStudent}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '追加中…' : '既存の授業に生徒を追加'}
      </button>
    </form>
  )
}
