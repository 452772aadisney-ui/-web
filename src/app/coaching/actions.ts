'use server'

import { evaluateAndUnlockAchievements, type UnlockedAchievement } from '@/lib/achievements/unlock'
import { isCoachingKarteTableMissingError } from '@/lib/coaching/karte-table'
import { revalidatePath } from 'next/cache'
import { notifyCoachingBookingCreated, notifyCoachingBookingCancelled, notifyCoachingBookingRescheduled } from '@/lib/discord/notifications'
import {
  createCoachingBookingCalendarEvent,
  deleteCoachingBookingCalendarEvent,
  updateCoachingBookingCalendarEvent,
} from '@/lib/google-calendar/events'
import { createClient } from '@/lib/supabase/server'
import {
  fetchCoachingGridForWeek,
  fetchAvailableCoachingSlots,
  isCoachingSlotOccupied,
  slotEndsAtIso,
  slotStartsAtIso,
  type CoachingGridSlot,
} from '@/lib/coaching/queries'
import { isCoachingSlotTime, slotDateTimeKey } from '@/lib/coaching/slot-times'
import { getDayWindow } from '@/lib/coaching/week'
import type { AvailableCoachingSlot } from '@/types/coaching'

export type CoachingActionState = {
  error?: string
  success?: boolean
  unlockedAchievements?: UnlockedAchievement[]
}

function revalidateCoachingPaths() {
  revalidatePath('/admin/coaching')
  revalidatePath('/admin/coaching/slots')
  revalidatePath('/admin/coaching/instructors')
  revalidatePath('/admin/coaching/bookings')
  revalidatePath('/admin/coaching/karte', 'layout')
  revalidatePath('/dashboard/coaching')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
}

async function assertAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'ログインが必要です'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return '管理者権限が必要です'
  return null
}

async function assertStudent(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'student') return { error: '生徒アカウントでのみ予約できます' }
  return { userId: user.id }
}

export async function createCoachingCoach(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const name = String(formData.get('name') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)

  if (!name) return { error: '講師名を入力してください' }

  const supabase = await createClient()
  const { error } = await supabase.from('coaching_coaches').insert({
    name,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
  })

  if (error) return { error: '講師の登録に失敗しました' }

  revalidateCoachingPaths()
  return { success: true }
}

export async function updateCoachingCoach(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const isActive = formData.get('isActive') === 'on'
  const sortOrder = Number(formData.get('sortOrder') ?? 0)

  if (!id || !name) return { error: '必須項目を入力してください' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('coaching_coaches')
    .update({
      name,
      is_active: isActive,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .eq('id', id)

  if (error) return { error: '講師の更新に失敗しました' }

  revalidateCoachingPaths()
  return { success: true }
}

export async function deleteCoachingCoach(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('coaching_coaches').delete().eq('id', id)
  revalidateCoachingPaths()
}

export async function loadCoachingGridForWeek(
  coachId: string,
  weekStart: string,
): Promise<CoachingGridSlot[]> {
  if (await assertAdmin()) return []
  if (!coachId || !weekStart) return []
  return fetchCoachingGridForWeek(coachId, weekStart)
}

export async function loadAvailableCoachingSlotsForWindow(
  coachId: string,
  windowStart: string,
): Promise<AvailableCoachingSlot[]> {
  const studentResult = await assertStudent()
  if ('error' in studentResult) return []
  if (!coachId || !windowStart) return []
  const dateKeys = getDayWindow(windowStart).map((day) => day.date)
  return fetchAvailableCoachingSlots(coachId, dateKeys)
}

export type CoachingSlotSelection = {
  slotDate: string
  startTime: string
}

async function applyCoachingSlotOpenState(
  coachId: string,
  slots: CoachingSlotSelection[],
  open: boolean,
): Promise<CoachingActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  if (!coachId || slots.length === 0) return { success: true }

  const validSlots = slots.filter(({ slotDate, startTime }) => {
    if (!slotDate || !startTime || !isCoachingSlotTime(startTime)) return false
    const startsAt = slotStartsAtIso(slotDate, startTime)
    return new Date(startsAt) > new Date()
  })

  if (validSlots.length === 0) return { success: true }

  const supabase = await createClient()
  const dateKeys = [...new Set(validSlots.map((slot) => slot.slotDate))]

  const { data: existingRows, error: existingError } = await supabase
    .from('coaching_slots')
    .select('id, slot_date, start_time, is_open')
    .eq('coach_id', coachId)
    .in('slot_date', dateKeys)

  if (existingError) return { error: '枠の取得に失敗しました' }

  const existingMap = new Map<string, { id: string; is_open: boolean }>()
  for (const row of existingRows ?? []) {
    const startTime = String(row.start_time).slice(0, 5)
    existingMap.set(slotDateTimeKey(String(row.slot_date), startTime), {
      id: row.id,
      is_open: row.is_open ?? false,
    })
  }

  if (open) {
    const payloads = validSlots
      .filter((slot) => {
        const existing = existingMap.get(slotDateTimeKey(slot.slotDate, slot.startTime))
        return !existing?.is_open
      })
      .map((slot) => ({
        coach_id: coachId,
        slot_date: slot.slotDate,
        start_time: `${slot.startTime}:00`,
        starts_at: slotStartsAtIso(slot.slotDate, slot.startTime),
        ends_at: slotEndsAtIso(slot.slotDate, slot.startTime),
        is_open: true,
      }))

    if (payloads.length > 0) {
      const { error } = await supabase.from('coaching_slots').upsert(payloads, {
        onConflict: 'coach_id,slot_date,start_time',
      })
      if (error) return { error: '枠の開放に失敗しました' }
    }
  } else {
    const slotIds = validSlots
      .map((slot) => existingMap.get(slotDateTimeKey(slot.slotDate, slot.startTime))?.id)
      .filter((id): id is string => Boolean(id))

    if (slotIds.length > 0) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('coaching_bookings')
        .select('slot_id')
        .in('slot_id', slotIds)
        .neq('status', 'cancelled')

      if (bookingsError) return { error: '予約状況の確認に失敗しました' }

      const bookedIds = new Set((bookings ?? []).map((booking) => booking.slot_id))
      const closableIds = slotIds.filter((id) => !bookedIds.has(id))

      if (closableIds.length > 0) {
        const { error } = await supabase
          .from('coaching_slots')
          .update({ is_open: false })
          .in('id', closableIds)

        if (error) return { error: '枠のクローズに失敗しました' }
      }
    }
  }

  revalidateCoachingPaths()
  return { success: true }
}

export async function setCoachingSlotsOpen(
  coachId: string,
  slots: CoachingSlotSelection[],
  open: boolean,
): Promise<CoachingActionState> {
  return applyCoachingSlotOpenState(coachId, slots, open)
}

export async function toggleCoachingSlot(formData: FormData): Promise<CoachingActionState> {
  const coachId = String(formData.get('coachId') ?? '').trim()
  const slotDate = String(formData.get('slotDate') ?? '').trim()
  const startTime = String(formData.get('startTime') ?? '').trim()
  const open = formData.get('open') === 'true'

  if (!coachId || !slotDate || !startTime) {
    return { error: '枠の指定が不正です' }
  }

  if (!isCoachingSlotTime(startTime)) {
    return { error: '時刻が不正です' }
  }

  const startsAt = slotStartsAtIso(slotDate, startTime)
  if (new Date(startsAt) <= new Date()) {
    return { error: '過去の枠は変更できません' }
  }

  return applyCoachingSlotOpenState(coachId, [{ slotDate, startTime }], open)
}

export async function bookCoachingSlot(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const studentResult = await assertStudent()
  if ('error' in studentResult) return { error: studentResult.error }

  const slotId = String(formData.get('slotId') ?? '').trim()
  const studentNote = String(formData.get('studentNote') ?? '').trim()

  if (!slotId) return { error: '予約枠を選択してください' }

  const supabase = await createClient()

  const { data: slot, error: slotError } = await supabase
    .from('coaching_slots')
    .select('id, coach_id, starts_at, is_open')
    .eq('id', slotId)
    .maybeSingle<{ id: string; coach_id: string; starts_at: string; is_open: boolean }>()

  if (slotError || !slot) return { error: '予約枠が見つかりません' }

  if (!slot.is_open) return { error: 'この予約枠は現在予約できません' }

  if (new Date(slot.starts_at) <= new Date()) {
    return { error: 'この予約枠は既に過ぎています' }
  }

  if (await isCoachingSlotOccupied(slotId)) {
    return { error: 'この予約枠は既に埋まっています' }
  }

  const { data: slotBooking } = await supabase
    .from('coaching_bookings')
    .select('id, status')
    .eq('slot_id', slotId)
    .eq('student_id', studentResult.userId)
    .maybeSingle<{ id: string; status: string }>()

  let bookingId: string

  if (slotBooking?.status === 'cancelled') {
    const { data: updated, error: updateError } = await supabase
      .from('coaching_bookings')
      .update({
        student_id: studentResult.userId,
        coach_id: slot.coach_id,
        student_note: studentNote,
        status: 'scheduled',
        google_calendar_event_id: null,
        booked_at: new Date().toISOString(),
      })
      .eq('id', slotBooking.id)
      .select('id')
      .single<{ id: string }>()

    if (updateError || !updated) {
      return { error: '予約に失敗しました' }
    }

    bookingId = updated.id
  } else {
    const { data: created, error } = await supabase
      .from('coaching_bookings')
      .insert({
        slot_id: slotId,
        student_id: studentResult.userId,
        coach_id: slot.coach_id,
        student_note: studentNote,
        status: 'scheduled',
      })
      .select('id')
      .single<{ id: string }>()

    if (error || !created) {
      if (error?.code === '23505') return { error: 'この予約枠は既に埋まっています' }
      return { error: '予約に失敗しました' }
    }

    bookingId = created.id
  }

  try {
    await notifyCoachingBookingCreated({
      studentId: studentResult.userId,
      slotId,
      coachId: slot.coach_id,
      startsAt: slot.starts_at,
      studentNote,
    })

    const calendarEventId = await createCoachingBookingCalendarEvent({
      studentId: studentResult.userId,
      slotId,
      coachId: slot.coach_id,
      startsAt: slot.starts_at,
      studentNote,
    })

    if (calendarEventId) {
      await supabase
        .from('coaching_bookings')
        .update({ google_calendar_event_id: calendarEventId })
        .eq('id', bookingId)
    }
  } catch (notificationError) {
    console.error('[coaching] booking notification failed:', notificationError)
  }

  revalidateCoachingPaths()
  const unlockedAchievements = await evaluateAndUnlockAchievements(studentResult.userId)
  return { success: true, unlockedAchievements }
}

export async function rescheduleCoachingBooking(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const studentResult = await assertStudent()
  if ('error' in studentResult) return { error: studentResult.error }

  const bookingId = String(formData.get('bookingId') ?? '').trim()
  const newSlotId = String(formData.get('slotId') ?? '').trim()
  const studentNote = String(formData.get('studentNote') ?? '').trim()

  if (!bookingId || !newSlotId) {
    return { error: '予約または日時を選択してください' }
  }

  const supabase = await createClient()

  const { data: booking, error: bookingError } = await supabase
    .from('coaching_bookings')
    .select(
      'id, student_id, coach_id, slot_id, student_note, status, google_calendar_event_id, coaching_slots(starts_at, ends_at, slot_date, start_time)',
    )
    .eq('id', bookingId)
    .maybeSingle<{
      id: string
      student_id: string
      coach_id: string
      slot_id: string
      student_note: string
      status: string
      google_calendar_event_id: string | null
      coaching_slots: {
        starts_at: string
        ends_at: string
        slot_date: string | null
        start_time: string | null
      }
    }>()

  if (bookingError || !booking) return { error: '予約が見つかりません' }

  if (booking.student_id !== studentResult.userId) {
    return { error: '権限がありません' }
  }

  if (booking.status !== 'scheduled') {
    return { error: '変更できる予約ではありません' }
  }

  if (new Date(booking.coaching_slots.starts_at) <= new Date()) {
    return { error: '開始済みの予約は変更できません' }
  }

  if (booking.slot_id === newSlotId) {
    return { error: '別の日時を選んでください' }
  }

  const { data: newSlot, error: slotError } = await supabase
    .from('coaching_slots')
    .select('id, coach_id, starts_at, ends_at, is_open')
    .eq('id', newSlotId)
    .maybeSingle<{
      id: string
      coach_id: string
      starts_at: string
      ends_at: string
      is_open: boolean
    }>()

  if (slotError || !newSlot) return { error: '予約枠が見つかりません' }
  if (!newSlot.is_open) return { error: 'この予約枠は現在予約できません' }
  if (new Date(newSlot.starts_at) <= new Date()) {
    return { error: 'この予約枠は既に過ぎています' }
  }

  if (await isCoachingSlotOccupied(newSlotId)) {
    return { error: 'この予約枠は既に埋まっています' }
  }

  const { data: slotBooking } = await supabase
    .from('coaching_bookings')
    .select('id, status')
    .eq('slot_id', newSlotId)
    .eq('student_id', studentResult.userId)
    .maybeSingle<{ id: string; status: string }>()

  const nextNote = studentNote || booking.student_note
  const oldSlotId = booking.slot_id
  const oldCoachId = booking.coach_id
  const oldStartsAt = booking.coaching_slots.starts_at

  const { error: updateError } = await supabase
    .from('coaching_bookings')
    .update({
      slot_id: newSlotId,
      coach_id: newSlot.coach_id,
      student_note: nextNote,
      booked_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  if (updateError) return { error: '予約の変更に失敗しました' }

  try {
    await notifyCoachingBookingRescheduled({
      studentId: booking.student_id,
      oldSlotId,
      newSlotId,
      oldCoachId,
      newCoachId: newSlot.coach_id,
      oldStartsAt,
      newStartsAt: newSlot.starts_at,
      studentNote: nextNote,
      rescheduledBy: 'student',
    })

    if (booking.google_calendar_event_id) {
      await updateCoachingBookingCalendarEvent({
        eventId: booking.google_calendar_event_id,
        studentId: booking.student_id,
        coachId: newSlot.coach_id,
        startsAt: newSlot.starts_at,
        endsAt: newSlot.ends_at,
        studentNote: nextNote,
      })
    } else {
      const calendarEventId = await createCoachingBookingCalendarEvent({
        studentId: booking.student_id,
        slotId: newSlotId,
        coachId: newSlot.coach_id,
        startsAt: newSlot.starts_at,
        studentNote: nextNote,
      })

      if (calendarEventId) {
        await supabase
          .from('coaching_bookings')
          .update({ google_calendar_event_id: calendarEventId })
          .eq('id', bookingId)
      }
    }
  } catch (notificationError) {
    console.error('[coaching] reschedule notification failed:', notificationError)
  }

  revalidateCoachingPaths()
  return { success: true }
}

export async function cancelCoachingBooking(formData: FormData): Promise<void> {
  await cancelCoachingBookingAction(formData)
}

async function cancelCoachingBookingAction(formData: FormData): Promise<CoachingActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const bookingId = String(formData.get('bookingId') ?? '').trim()
  if (!bookingId) return { error: '予約が指定されていません' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  const isAdmin = profile?.role === 'admin'

  const { data: booking, error: fetchError } = await supabase
    .from('coaching_bookings')
    .select(
      'id, student_id, coach_id, slot_id, student_note, status, google_calendar_event_id, coaching_slots(starts_at)',
    )
    .eq('id', bookingId)
    .maybeSingle<{
      id: string
      student_id: string
      coach_id: string
      slot_id: string
      student_note: string
      status: string
      google_calendar_event_id: string | null
      coaching_slots: { starts_at: string }
    }>()

  if (fetchError || !booking) return { error: '予約が見つかりません' }

  if (!isAdmin && booking.student_id !== user.id) {
    return { error: '権限がありません' }
  }

  if (booking.status === 'cancelled') return { success: true }

  if (!isAdmin && new Date(booking.coaching_slots.starts_at) <= new Date()) {
    return { error: '開始済みの予約はキャンセルできません' }
  }

  const { error } = await supabase
    .from('coaching_bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)

  if (error) return { error: 'キャンセルに失敗しました' }

  try {
    await notifyCoachingBookingCancelled({
      studentId: booking.student_id,
      slotId: booking.slot_id,
      coachId: booking.coach_id,
      startsAt: booking.coaching_slots.starts_at,
      studentNote: booking.student_note,
      cancelledBy: isAdmin ? 'admin' : 'student',
    })
    await deleteCoachingBookingCalendarEvent(booking.google_calendar_event_id)
  } catch (notificationError) {
    console.error('[coaching] cancellation notification failed:', notificationError)
  }

  revalidateCoachingPaths()
  return { success: true }
}

export async function completeCoachingBooking(formData: FormData): Promise<void> {
  await completeCoachingBookingAction(formData)
}

async function completeCoachingBookingAction(formData: FormData): Promise<CoachingActionState> {
  if (await assertAdmin()) return { error: '管理者権限が必要です' }

  const bookingId = String(formData.get('bookingId') ?? '').trim()
  if (!bookingId) return { error: '予約が指定されていません' }

  const supabase = await createClient()
  const { data: booking, error: fetchError } = await supabase
    .from('coaching_bookings')
    .select('student_id')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchError || !booking) return { error: '予約が見つかりません' }

  const { error } = await supabase
    .from('coaching_bookings')
    .update({ status: 'completed' })
    .eq('id', bookingId)

  if (error) return { error: '更新に失敗しました' }

  await evaluateAndUnlockAchievements(String(booking.student_id))

  revalidateCoachingPaths()
  return { success: true }
}

export async function createCoachingKarteEntry(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const studentId = String(formData.get('studentId') ?? '').trim()
  const bookingId = String(formData.get('bookingId') ?? '').trim()
  const coachId = String(formData.get('coachId') ?? '').trim()
  const sessionDate = String(formData.get('sessionDate') ?? '').trim()
  const discussionContent = String(formData.get('discussionContent') ?? '').trim()
  const nextCommitments = String(formData.get('nextCommitments') ?? '').trim()

  if (!studentId) return { error: '生徒が指定されていません' }
  if (!sessionDate) return { error: '面談日を入力してください' }
  if (!discussionContent) return { error: '話した内容を入力してください' }

  const { error } = await supabase.from('coaching_karte_entries').insert({
    student_id: studentId,
    booking_id: bookingId || null,
    coach_id: coachId || null,
    session_date: sessionDate,
    discussion_content: discussionContent,
    next_commitments: nextCommitments,
    created_by: user.id,
  })

  if (error) {
    if (isCoachingKarteTableMissingError(error.message)) {
      return {
        error:
          'カルテ用のデータベースが未設定です。Supabase に 044_coaching_karte.sql を適用してください。',
      }
    }
    return { error: 'カルテの保存に失敗しました' }
  }

  revalidateCoachingPaths()
  revalidatePath(`/admin/coaching/karte/${studentId}`)
  return { success: true }
}
