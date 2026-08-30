'use client'

import { useEffect, useState } from 'react'
import { CoachingWeekGrid } from '@/components/coaching/CoachingWeekGrid'
import type { CoachingCoach } from '@/types/coaching'
import type { CoachingGridSlot } from '@/lib/coaching/queries'

interface AdminCoachingSlotsManagerProps {
  coaches: CoachingCoach[]
  selectedCoachId: string | null
  weekStart: string
  gridSlots: CoachingGridSlot[]
}

export function AdminCoachingSlotsManager({
  coaches,
  selectedCoachId: initialSelectedCoachId,
  weekStart,
  gridSlots,
}: AdminCoachingSlotsManagerProps) {
  const [selectedCoachId, setSelectedCoachId] = useState(initialSelectedCoachId)
  const activeCoaches = coaches.filter((c) => c.is_active)

  useEffect(() => {
    setSelectedCoachId(initialSelectedCoachId)
  }, [initialSelectedCoachId])

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">予約枠の開放</h2>
      <p className="mt-1 text-sm text-muted">
        10:00〜21:00（30分刻み）の枠から、開放する時間帯を選びます。
      </p>

      {activeCoaches.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          先に
          <a href="/admin/coaching/instructors" className="mx-1 text-primary hover:underline">
            講師追加
          </a>
          で担当講師を登録してください。
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {activeCoaches.map((coach) => (
              <button
                key={coach.id}
                type="button"
                onClick={() => setSelectedCoachId(coach.id)}
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

          {selectedCoachId && (
            <div className="mt-6 min-w-0">
              <CoachingWeekGrid
                mode="admin"
                coachId={selectedCoachId}
                weekStart={weekStart}
                gridSlots={selectedCoachId === initialSelectedCoachId ? gridSlots : []}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
