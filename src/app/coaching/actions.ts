'use server'

import { revalidatePath } from 'next/cache'
import { notifyCoachingBookingCreated } from '@/lib/discord/notifications'
import { createCoachingBookingCalendarEvent } from '@/lib/google-calendar/events'
import { createClient } from '@/lib/supabase/server'
import {
  fetchCoachingBookingBySlotId,
  fetchCoachingGridForWeek,
  fetchAvailableCoachingSlots,
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
}

function revalidateCoachingPaths() {
  revalidatePath('/admin/coaching')
  revalidatePath('/admin/coaching/bookings')
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

  const existing = await fetchCoachingBookingBySlotId(slotId)
  if (existing) return { error: 'この予約枠は既に埋まっています' }

  const { error } = await supabase.from('coaching_bookings').insert({
    slot_id: slotId,
    student_id: studentResult.userId,
    coach_id: slot.coach_id,
    student_note: studentNote,
    status: 'scheduled',
  })

  if (error) {
    if (error.code === '23505') return { error: 'この予約枠は既に埋まっています' }
    return { error: '予約に失敗しました' }
  }

  try {
    await notifyCoachingBookingCreated({
      studentId: studentResult.userId,
      slotId,
      coachId: slot.coach_id,
      startsAt: slot.starts_at,
      studentNote,
    })
    await createCoachingBookingCalendarEvent({
      studentId: studentResult.userId,
      slotId,
      coachId: slot.coach_id,
      startsAt: slot.starts_at,
      studentNote,
    })
  } catch (notificationError) {
    console.error('[coaching] booking notification failed:', notificationError)
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
    .select('id, student_id, status, coaching_slots(starts_at)')
    .eq('id', bookingId)
    .maybeSingle<{
      id: string
      student_id: string
      status: string
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
  const { error } = await supabase
    .from('coaching_bookings')
    .update({ status: 'completed' })
    .eq('id', bookingId)

  if (error) return { error: '更新に失敗しました' }

  revalidateCoachingPaths()
  return { success: true }
}
