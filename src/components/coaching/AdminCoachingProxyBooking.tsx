'use client'

import { useActionState, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminBookCoachingSlot,
  type CoachingActionState,
} from '@/app/coaching/actions'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { getPersonName } from '@/lib/auth/display-name'
import { useActionToast } from '@/hooks/useActionToast'
import type { AvailableCoachingSlot, CoachingCoach } from '@/types/coaching'

const initialState: CoachingActionState = {}
const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

interface AdminCoachingProxyBookingProps {
  coaches: CoachingCoach[]
  students: Array<{
    id: string
    full_name: string
    display_name: string
    student_code: string | null
  }>
  selectedCoachId: string | null
  windowStart: string
  availableSlots: AvailableCoachingSlot[]
  defaultStudentId?: string
}

export function AdminCoachingProxyBooking({
  coaches,
  students,
  selectedCoachId: initialSelectedCoachId,
  windowStart,
  availableSlots,
  defaultStudentId = '',
}: AdminCoachingProxyBookingProps) {
  const router = useRouter()
  const [studentQuery, setStudentQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState(defaultStudentId)
  const [selectedCoachId, setSelectedCoachId] = useState(initialSelectedCoachId)
  const [selectedSlot, setSelectedSlot] = useState<AvailableCoachingSlot | null>(null)
  const [state, formAction, pending] = useActionState(adminBookCoachingSlot, initialState)

  useActionToast(state, {
    successMessage: 'コーチングを予約しました',
    pending,
  })

  useEffect(() => {
    setSelectedCoachId(initialSelectedCoachId)
  }, [initialSelectedCoachId])

  useEffect(() => {
    setSelectedStudentId(defaultStudentId)
  }, [defaultStudentId])

  useEffect(() => {
    if (state.success) {
      setSelectedSlot(null)
      router.refresh()
    }
  }, [state.success, router])

  const filteredStudents = useMemo(() => {
    const normalized = studentQuery.trim().toLowerCase()
    if (!normalized) return students

    return students.filter((student) => {
      const name = getPersonName(student).toLowerCase()
      const code = (student.student_code ?? '').toLowerCase()
      return name.includes(normalized) || code.includes(normalized)
    })
  }, [studentQuery, students])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStudentId || !selectedSlot) return

    const label = formatCoachingBookingDateTime(
      selectedSlot.slot_date,
      selectedSlot.start_time,
      selectedSlot.starts_at,
      selectedSlot.ends_at,
    )
    const studentName = getPersonName(
      students.find((student) => student.id === selectedStudentId) ?? {
        full_name: '',
        display_name: '',
      },
    )

    if (
      !window.confirm(
        `${studentName} さんを ${label}（${selectedSlot.coach.name}）で予約します。よろしいですか？`,
      )
    ) {
      return
    }

    formAction(new FormData(event.currentTarget))
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">生徒の代理予約</h2>
      <p className="mt-1 text-sm text-muted">
        生徒に代わってコーチング枠を予約できます。
      </p>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">1. 生徒を選ぶ *</span>
          <input
            type="search"
            value={studentQuery}
            onChange={(event) => setStudentQuery(event.target.value)}
            placeholder="生徒名・生徒番号で検索"
            className={fieldClass}
          />
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            className={`${fieldClass} mt-2`}
          >
            <option value="">生徒を選択</option>
            {filteredStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {getPersonName(student)}
                {student.student_code ? `（${student.student_code}）` : ''}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm font-medium">2. 担当を選ぶ *</p>
          {coaches.length === 0 ? (
            <p className="text-sm text-muted">現在、予約可能な担当者がいません。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {coaches.map((coach) => (
                <button
                  key={coach.id}
                  type="button"
                  onClick={() => {
                    setSelectedCoachId(coach.id)
                    setSelectedSlot(null)
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    selectedCoachId === coach.id
                      ? 'border-primary bg-blue-50 text-primary'
                      : 'border-border hover:bg-background'
                  }`}
                >
                  {coach.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStudentId && selectedCoachId && (
          <div>
            <p className="mb-2 text-sm font-medium">3. 日時を選ぶ *</p>
            <CoachingWeekGrid
              mode="student"
              coachId={selectedCoachId}
              windowStart={windowStart}
              availableSlots={
                selectedCoachId === initialSelectedCoachId ? availableSlots : []
              }
              selectedSlotId={selectedSlot?.id ?? null}
              onSelectSlot={setSelectedSlot}
              onNavigate={() => setSelectedSlot(null)}
            />
          </div>
        )}

        {selectedStudentId && selectedSlot && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-primary/30 bg-blue-50/40 p-4">
            <input type="hidden" name="studentId" value={selectedStudentId} />
            <input type="hidden" name="slotId" value={selectedSlot.id} />
            <p className="text-sm font-medium">
              {selectedSlot.coach.name} /{' '}
              {formatCoachingBookingDateTime(
                selectedSlot.slot_date,
                selectedSlot.start_time,
                selectedSlot.starts_at,
                selectedSlot.ends_at,
              )}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">伝言（任意）</span>
              <textarea
                name="studentNote"
                rows={3}
                placeholder="例: 志望校の相談、数学の苦手分野など"
                className={fieldClass}
              />
            </label>
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
                {pending ? '予約中…' : 'この枠で予約する'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="text-sm text-muted"
              >
                戻る
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
