/** コーチング予約枠（30分刻み・10:00開始〜21:00開始） */
export const COACHING_SLOT_START_HOUR = 10
export const COACHING_SLOT_END_HOUR = 21
export const COACHING_SLOT_INTERVAL_MINUTES = 30
export const COACHING_SLOT_DURATION_MINUTES = 30

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const COACHING_SLOT_TIMES: string[] = (() => {
  const times: string[] = []
  for (let hour = COACHING_SLOT_START_HOUR; hour <= COACHING_SLOT_END_HOUR; hour++) {
    for (const minute of [0, 30]) {
      if (hour === COACHING_SLOT_END_HOUR && minute === 30) break
      times.push(formatTime(hour, minute))
    }
  }
  return times
})()

export function isCoachingSlotTime(value: string): boolean {
  return COACHING_SLOT_TIMES.includes(value)
}

export function buildSlotDateTime(slotDate: string, startTime: string): Date {
  return new Date(`${slotDate}T${startTime}:00`)
}

export function buildSlotEndDateTime(slotDate: string, startTime: string): Date {
  const start = buildSlotDateTime(slotDate, startTime)
  return new Date(start.getTime() + COACHING_SLOT_DURATION_MINUTES * 60 * 1000)
}

export function slotDateTimeKey(slotDate: string, startTime: string): string {
  return `${slotDate}_${startTime}`
}
