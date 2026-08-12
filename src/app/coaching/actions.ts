'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchCoachingBookingBySlotId } from '@/lib/coaching/queries'

export type CoachingActionState = {
  error?: string
  success?: boolean
}

function revalidateCoachingPaths() {
  revalidatePath('/admin/coaching')
  revalidatePath('/dashboard/coaching')
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

function parseDateTime(date: string, time: string): string | null {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}:00`)
  if (Number.isNaN(value.getTime())) return null
  return value.toISOString()
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

export async function createCoachingSlot(
  _prev: CoachingActionState,
  formData: FormData,
): Promise<CoachingActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const coachId = String(formData.get('coachId') ?? '').trim()
  const date = String(formData.get('slotDate') ?? '').trim()
  const startTime = String(formData.get('startTime') ?? '').trim()
  const endTime = String(formData.get('endTime') ?? '').trim()

  const startsAt = parseDateTime(date, startTime)
  const endsAt = parseDateTime(date, endTime)

  if (!coachId || !startsAt || !endsAt) {
    return { error: '講師・日付・時間を入力してください' }
  }

  if (endsAt <= startsAt) {
    return { error: '終了時刻は開始時刻より後にしてください' }
  }

  if (new Date(startsAt) <= new Date()) {
    return { error: '未来の日時を指定してください' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('coaching_slots').insert({
    coach_id: coachId,
    starts_at: startsAt,
    ends_at: endsAt,
  })

  if (error) return { error: '予約枠の登録に失敗しました' }

  revalidateCoachingPaths()
  return { success: true }
}

export async function deleteCoachingSlot(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const existing = await fetchCoachingBookingBySlotId(id)
  if (existing) return

  const supabase = await createClient()
  await supabase.from('coaching_slots').delete().eq('id', id)
  revalidateCoachingPaths()
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
    .select('id, coach_id, starts_at')
    .eq('id', slotId)
    .maybeSingle<{ id: string; coach_id: string; starts_at: string }>()

  if (slotError || !slot) return { error: '予約枠が見つかりません' }

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
