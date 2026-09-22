'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  CLASS_COURSE_SUBJECTS,
  CLASS_COURSE_SUBJECT_LABELS,
  CLASS_COURSE_TERM_LABELS,
  CLASS_COURSE_TERMS,
  CLASS_COURSE_TRACK_LABELS,
  resolveAcademicYearFromJstDateKey,
  type ClassCourseSubject,
  type ClassCourseTerm,
  type ClassCourseTrack,
} from '@/lib/class-course/catalog'
import {
  listAssignedStudentsForCourseUnit,
  listCourseUnitsForScope,
} from '@/app/class-course/actions'
import { classScheduleFieldClass } from '@/lib/class-schedule/format'

export type SessionMode = 'course' | 'freeform'

export type CourseSessionDraft = {
  mode: SessionMode
  academicYear: number
  term: ClassCourseTerm
  subject: ClassCourseSubject
  track: ClassCourseTrack
  courseUnitId: string
  attendeeIds: string[]
  freeSubject: string
  note: string
  startTime: string
  endTime: string
}

type UnitOption = { id: string; seqNo: number; displayName: string }
type StudentOption = { id: string; label: string }
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function defaultCourseSessionDraft(todayKey: string): CourseSessionDraft {
  return {
    mode: 'course',
    academicYear: resolveAcademicYearFromJstDateKey(todayKey),
    term: 'second_half',
    subject: 'english_reading',
    track: 'regular',
    courseUnitId: '',
    attendeeIds: [],
    freeSubject: '',
    note: '',
    startTime: '10:00',
    endTime: '11:30',
  }
}

/**
 * Primary: 年度→時期→科目→枠→授業番号→割当済み生徒チェック.
 * Auxiliary: freeform subject.
 * Hidden inputs: sessionMode[], courseUnitId[], attendeeIds_<index>[], sessionSubject[], …
 */
export function CourseLinkedSessionFields(props: {
  index: number
  value: CourseSessionDraft
  onChange: (next: CourseSessionDraft) => void
  /** Prefix for multi-session forms (create day). */
  namePrefix?: string
  /**
   * Checkbox name for attendees.
   * Create-day: attendeeIds_0, attendeeIds_1, …
   * Add-session: attendeeIds
   */
  attendeeInputName?: string
  /** When true, hide mode switch and force course (edit existing linked session). */
  lockCourseMode?: boolean
}) {
  const prefix = props.namePrefix ?? ''
  const attendeeName =
    props.attendeeInputName ?? `${prefix}attendeeIds_${props.index}`
  const v = props.value
  const [units, setUnits] = useState<UnitOption[]>([])
  const [unitsState, setUnitsState] = useState<LoadState>('idle')
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<StudentOption[]>([])
  const [assigneeState, setAssigneeState] = useState<LoadState>('idle')
  const [assigneeError, setAssigneeError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const unitsRequestRef = useRef(0)
  const assigneesRequestRef = useRef(0)

  useEffect(() => {
    if (v.mode !== 'course') {
      setUnits([])
      setUnitsState('idle')
      setUnitsError(null)
      return
    }
    const requestId = ++unitsRequestRef.current
    setUnitsState('loading')
    setUnitsError(null)
    startTransition(async () => {
      const result = await listCourseUnitsForScope({
        academicYear: v.academicYear,
        term: v.term,
        subject: v.subject,
        track: v.track,
      })
      if (requestId !== unitsRequestRef.current) return
      if (!result.ok) {
        setUnits([])
        setUnitsState('error')
        setUnitsError(result.error)
        return
      }
      setUnits(result.units)
      setUnitsState('ready')
      if (v.courseUnitId && !result.units.some((r) => r.id === v.courseUnitId)) {
        props.onChange({ ...v, courseUnitId: '', attendeeIds: [] })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on scope only
  }, [v.mode, v.academicYear, v.term, v.subject, v.track])

  useEffect(() => {
    if (v.mode !== 'course' || !v.courseUnitId) {
      assigneesRequestRef.current += 1
      setAssignees([])
      setAssigneeState('idle')
      setAssigneeError(null)
      return
    }
    const requestId = ++assigneesRequestRef.current
    const unitId = v.courseUnitId
    setAssignees([])
    setAssigneeState('loading')
    setAssigneeError(null)
    startTransition(async () => {
      const result = await listAssignedStudentsForCourseUnit(unitId)
      if (requestId !== assigneesRequestRef.current) return
      if (!result.ok) {
        setAssignees([])
        setAssigneeState('error')
        setAssigneeError(result.error)
        return
      }
      setAssignees(result.students)
      setAssigneeState('ready')
      const allowed = new Set(result.students.map((r) => r.id))
      const nextAttendees = v.attendeeIds.filter((id) => allowed.has(id))
      if (nextAttendees.length !== v.attendeeIds.length) {
        props.onChange({ ...v, attendeeIds: nextAttendees })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.mode, v.courseUnitId])

  function patch(partial: Partial<CourseSessionDraft>) {
    props.onChange({ ...v, ...partial })
  }

  return (
    <div className="space-y-3">
      {props.lockCourseMode ? (
        <input type="hidden" name={`${prefix}sessionMode`} value="course" />
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold text-muted">コマの種類</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefix}sessionMode_${props.index}`}
              checked={v.mode === 'course'}
              onChange={() => patch({ mode: 'course' })}
            />
            回数管理の授業（推奨）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefix}sessionMode_${props.index}`}
              checked={v.mode === 'freeform'}
              onChange={() =>
                patch({ mode: 'freeform', courseUnitId: '', attendeeIds: [] })
              }
            />
            自由記述（例外）
          </label>
          <input type="hidden" name={`${prefix}sessionMode`} value={v.mode} />
        </fieldset>
      )}

      {v.mode === 'course' ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">年度</span>
              <input
                type="number"
                className={classScheduleFieldClass}
                value={v.academicYear}
                onChange={(e) =>
                  patch({
                    academicYear: Number(e.target.value),
                    courseUnitId: '',
                    attendeeIds: [],
                  })
                }
                min={2000}
                max={2100}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">時期</span>
              <select
                className={classScheduleFieldClass}
                value={v.term}
                onChange={(e) =>
                  patch({
                    term: e.target.value as ClassCourseTerm,
                    courseUnitId: '',
                    attendeeIds: [],
                  })
                }
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
                className={classScheduleFieldClass}
                value={v.subject}
                onChange={(e) =>
                  patch({
                    subject: e.target.value as ClassCourseSubject,
                    courseUnitId: '',
                    attendeeIds: [],
                  })
                }
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
                className={classScheduleFieldClass}
                value={v.track}
                onChange={(e) =>
                  patch({
                    track: e.target.value as ClassCourseTrack,
                    courseUnitId: '',
                    attendeeIds: [],
                  })
                }
              >
                <option value="regular">{CLASS_COURSE_TRACK_LABELS.regular}</option>
                <option value="addon">{CLASS_COURSE_TRACK_LABELS.addon}</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium">授業番号</span>
            <select
              className={classScheduleFieldClass}
              name={`${prefix}courseUnitId`}
              value={v.courseUnitId}
              required={v.mode === 'course'}
              onChange={(e) =>
                patch({ courseUnitId: e.target.value, attendeeIds: [] })
              }
            >
              <option value="">
                {unitsState === 'loading' ? '読み込み中…' : '選択してください'}
              </option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.displayName}
                </option>
              ))}
            </select>
          </label>
          {unitsState === 'error' && unitsError ? (
            <p className="text-xs text-red-600">{unitsError}</p>
          ) : null}
          {unitsState === 'ready' && units.length === 0 ? (
            <p className="text-xs text-muted">
              この条件の共通授業がありません。先に授業回数登録で作成してください。
            </p>
          ) : null}

          {v.courseUnitId ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">この日時の対象生徒</p>
              {assigneeState === 'loading' ? (
                <p className="text-xs text-muted">割当生徒を読み込み中…</p>
              ) : null}
              {assigneeState === 'error' && assigneeError ? (
                <p className="text-xs text-red-600">{assigneeError}</p>
              ) : null}
              {assigneeState === 'ready' && assignees.length === 0 ? (
                <p className="text-xs text-muted">
                  この授業に割り当て済みの生徒がいません。先に授業回数登録で割り当ててください。
                </p>
              ) : null}
              {assigneeState === 'ready' && assignees.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {assignees.map((student) => (
                    <li key={student.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={attendeeName}
                          value={student.id}
                          checked={v.attendeeIds.includes(student.id)}
                          onChange={() => {
                            const set = new Set(v.attendeeIds)
                            if (set.has(student.id)) set.delete(student.id)
                            else set.add(student.id)
                            patch({ attendeeIds: [...set] })
                          }}
                        />
                        <span>{student.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {/* subject is server-generated for course mode */}
          <input type="hidden" name={`${prefix}sessionSubject`} value="" />
        </>
      ) : (
        <>
          <input type="hidden" name={`${prefix}courseUnitId`} value="" />
          <label className="block text-sm">
            <span className="font-medium">科目（自由記述）*</span>
            <input
              name={`${prefix}sessionSubject`}
              required
              value={v.freeSubject}
              onChange={(e) => patch({ freeSubject: e.target.value })}
              className={classScheduleFieldClass}
              list="class-schedule-subject-suggestions"
            />
          </label>
        </>
      )}

      <label className="block text-sm">
        <span className="font-medium">生徒向け補足</span>
        <input
          name={`${prefix}sessionNote`}
          value={v.note}
          onChange={(e) => patch({ note: e.target.value })}
          className={classScheduleFieldClass}
        />
      </label>
    </div>
  )
}
