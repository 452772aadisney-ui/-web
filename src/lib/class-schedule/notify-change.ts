/**
 * Pure helpers: detect notifiable field changes for class-schedule notifications.
 */

export type ClassScheduleDayComparable = {
  schedule_date: string
  venue_name: string
  address: string | null
  map_url: string | null
  room_note: string | null
}

export type ClassScheduleSessionComparable = {
  start_time: string
  end_time: string
  subject: string
  note: string | null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeTime(value: string): string {
  return value.trim().slice(0, 5)
}

export function classScheduleDayFieldsChanged(
  before: ClassScheduleDayComparable,
  after: ClassScheduleDayComparable,
): boolean {
  return (
    before.schedule_date !== after.schedule_date ||
    before.venue_name.trim() !== after.venue_name.trim() ||
    normalizeNullableText(before.address) !== normalizeNullableText(after.address) ||
    normalizeNullableText(before.map_url) !== normalizeNullableText(after.map_url) ||
    normalizeNullableText(before.room_note) !== normalizeNullableText(after.room_note)
  )
}

export function classScheduleSessionFieldsChanged(
  before: ClassScheduleSessionComparable,
  after: ClassScheduleSessionComparable,
): boolean {
  return (
    normalizeTime(before.start_time) !== normalizeTime(after.start_time) ||
    normalizeTime(before.end_time) !== normalizeTime(after.end_time) ||
    before.subject.trim() !== after.subject.trim() ||
    normalizeNullableText(before.note) !== normalizeNullableText(after.note)
  )
}
