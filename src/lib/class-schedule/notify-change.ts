/**
 * Pure helpers: detect notifiable field changes for class-schedule notifications.
 */

export type ClassScheduleDayComparable = {
  schedule_date: string
  venue_name: string
  location_details: string | null
}

export type ClassScheduleSessionComparable = {
  start_time: string
  end_time: string
  subject: string
  note: string | null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.replace(/^\s+|\s+$/g, '')
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
    normalizeNullableText(before.location_details) !==
      normalizeNullableText(after.location_details)
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
