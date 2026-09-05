/**
 * Candidate loaders for coaching reminder crons (Admin Client).
 * Eligibility mirrors fetchStudentsWithoutCoachingBookingThisWeek:
 * - exclude 既卒 grade tag
 * - "booked this week" = scheduled|completed on slot_date in JST week
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import {
  getJstTomorrowDateKey,
  getJstWeekDateKeys,
  getJstWeekMondayDateKey,
} from '@/lib/coaching/coaching-reminder-jst'

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

export type BookingPromptCandidate = {
  studentId: string
  email: string | null
}

export type SessionReminderCandidate = {
  bookingId: string
  studentId: string
  email: string | null
  startsAt: string
  slotDate: string
}

async function loadGradeTagMap(admin: AdminClient): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('profile_student_tags')
    .select('profile_id, tag_id, student_tags(name, category)')

  if (error || !data) return new Map()

  const map = new Map<string, string>()
  for (const row of data as Array<{
    profile_id: string
    student_tags:
      | { name: string; category: string | null }
      | Array<{ name: string; category: string | null }>
      | null
  }>) {
    const tag = Array.isArray(row.student_tags)
      ? row.student_tags[0]
      : row.student_tags
    if (!tag) continue
    if (tag.category !== '学年') continue
    if (!map.has(row.profile_id)) {
      map.set(row.profile_id, tag.name)
    }
  }
  return map
}

export async function loadBookingPromptCandidates(params?: {
  now?: Date
  admin?: AdminClient
}): Promise<
  | {
      ok: true
      weekMondayKey: string
      weekDates: string[]
      candidates: BookingPromptCandidate[]
      bookedStudentCount: number
    }
  | { ok: false }
> {
  const admin = params?.admin ?? createAdminClient()
  if (!admin) return { ok: false }

  const weekMondayKey = getJstWeekMondayDateKey(params?.now)
  const weekDates = getJstWeekDateKeys(weekMondayKey)

  const { data: students, error: studentsError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'student')

  if (studentsError || !students) return { ok: false }

  const gradeMap = await loadGradeTagMap(admin)

  const { data: bookings, error: bookingsError } = await admin
    .from('coaching_bookings')
    .select('student_id, coaching_slots!inner(slot_date)')
    .in('status', ['scheduled', 'completed'])
    .in('coaching_slots.slot_date', weekDates)

  if (bookingsError) return { ok: false }

  const bookedIds = new Set(
    (bookings ?? []).map((row) => String((row as { student_id: string }).student_id)),
  )

  const candidates: BookingPromptCandidate[] = []
  for (const row of students as Array<{ id: string; email: string | null }>) {
    if (bookedIds.has(row.id)) continue
    if (isKisotsuGradeTag(gradeMap.get(row.id))) continue
    candidates.push({
      studentId: row.id,
      email: row.email?.trim() ? row.email.trim() : null,
    })
  }

  return {
    ok: true,
    weekMondayKey,
    weekDates,
    candidates,
    bookedStudentCount: bookedIds.size,
  }
}

/** Recheck: student still has no scheduled|completed booking this week. */
export async function studentStillUnbookedThisWeek(
  admin: AdminClient,
  studentId: string,
  weekDates: string[],
): Promise<{ ok: true; unbooked: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('coaching_bookings')
    .select('id, coaching_slots!inner(slot_date)')
    .eq('student_id', studentId)
    .in('status', ['scheduled', 'completed'])
    .in('coaching_slots.slot_date', weekDates)
    .limit(1)

  if (error) return { ok: false }
  return { ok: true, unbooked: (data?.length ?? 0) === 0 }
}

export async function loadSessionReminderCandidates(params?: {
  now?: Date
  admin?: AdminClient
}): Promise<
  | { ok: true; tomorrowKey: string; candidates: SessionReminderCandidate[] }
  | { ok: false }
> {
  const admin = params?.admin ?? createAdminClient()
  if (!admin) return { ok: false }

  const tomorrowKey = getJstTomorrowDateKey(params?.now)

  const { data: bookings, error } = await admin
    .from('coaching_bookings')
    .select('id, student_id, coaching_slots!inner(slot_date, starts_at)')
    .eq('status', 'scheduled')
    .eq('coaching_slots.slot_date', tomorrowKey)

  if (error || !bookings) return { ok: false }

  const studentIds = [
    ...new Set(bookings.map((r) => String((r as { student_id: string }).student_id))),
  ]

  const emailById = new Map<string, string | null>()
  if (studentIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, role')
      .in('id', studentIds)

    for (const p of (profiles ?? []) as Array<{
      id: string
      email: string | null
      role: string
    }>) {
      if (p.role !== 'student') continue
      emailById.set(p.id, p.email?.trim() ? p.email.trim() : null)
    }
  }

  const candidates: SessionReminderCandidate[] = []
  const seenBookingIds = new Set<string>()
  for (const row of bookings as Array<{
    id: string
    student_id: string
    coaching_slots:
      | { slot_date: string; starts_at: string }
      | Array<{ slot_date: string; starts_at: string }>
  }>) {
    if (seenBookingIds.has(row.id)) continue
    seenBookingIds.add(row.id)
    if (!emailById.has(row.student_id)) continue
    const slot = Array.isArray(row.coaching_slots)
      ? row.coaching_slots[0]
      : row.coaching_slots
    if (!slot?.starts_at || !slot.slot_date) continue
    candidates.push({
      bookingId: row.id,
      studentId: row.student_id,
      email: emailById.get(row.student_id) ?? null,
      startsAt: slot.starts_at,
      slotDate: slot.slot_date,
    })
  }

  return { ok: true, tomorrowKey, candidates }
}

/** Recheck scheduled booking still on tomorrowKey with same starts_at. */
export async function sessionBookingStillValid(
  admin: AdminClient,
  bookingId: string,
  tomorrowKey: string,
  expectedStartsAt: string,
): Promise<{ ok: true; valid: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('coaching_bookings')
    .select('id, status, coaching_slots!inner(slot_date, starts_at)')
    .eq('id', bookingId)
    .maybeSingle<{
      id: string
      status: string
      coaching_slots:
        | { slot_date: string; starts_at: string }
        | Array<{ slot_date: string; starts_at: string }>
    }>()

  if (error) return { ok: false }
  if (!data) return { ok: true, valid: false }
  if (data.status !== 'scheduled') return { ok: true, valid: false }
  const slot = Array.isArray(data.coaching_slots)
    ? data.coaching_slots[0]
    : data.coaching_slots
  if (!slot) return { ok: true, valid: false }
  if (slot.slot_date !== tomorrowKey) return { ok: true, valid: false }
  if (slot.starts_at !== expectedStartsAt) return { ok: true, valid: false }
  return { ok: true, valid: true }
}
