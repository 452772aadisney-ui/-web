'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/class-schedule/access'
import {
  findFirstInternalOverlap,
  hasOverlappingScheduledSession,
} from '@/lib/class-schedule/overlap'
import { parseDayFields, parseSessionDraft } from '@/lib/class-schedule/validation'
import type { ClassScheduleSession } from '@/types/class-schedule'

export type ClassScheduleActionState = {
  error?: string
  success?: boolean
  successMessage?: string
}

function revalidateClassSchedulePaths(dayId?: string) {
  revalidatePath('/admin/class-schedule')
  revalidatePath('/admin/class-schedule/new')
  revalidatePath('/dashboard/class-schedule')
  revalidatePath('/dashboard/class-schedule/past')
  if (dayId) {
    revalidatePath(`/admin/class-schedule/${dayId}`)
  }
}

function parseSessionsFromFormData(formData: FormData): {
  ok: true
  sessions: Array<{
    start_time: string
    end_time: string
    subject: string
    note: string | null
  }>
} | { ok: false; error: string } {
  const starts = formData.getAll('sessionStartTime').map(String)
  const ends = formData.getAll('sessionEndTime').map(String)
  const subjects = formData.getAll('sessionSubject').map(String)
  const notes = formData.getAll('sessionNote').map(String)

  const count = Math.max(starts.length, ends.length, subjects.length, notes.length)
  if (count === 0) {
    return { ok: false, error: 'コマを1つ以上追加してください' }
  }

  const sessions: Array<{
    start_time: string
    end_time: string
    subject: string
    note: string | null
  }> = []

  for (let i = 0; i < count; i += 1) {
    const parsed = parseSessionDraft({
      start_time: starts[i] ?? '',
      end_time: ends[i] ?? '',
      subject: subjects[i] ?? '',
      note: notes[i] ?? '',
    })
    if (!parsed.ok) {
      return { ok: false, error: `${i + 1}コマ目: ${parsed.error}` }
    }
    sessions.push(parsed.session)
  }

  const internal = findFirstInternalOverlap(sessions)
  if (internal) {
    return {
      ok: false,
      error: `${internal.indexA + 1}コマ目と${internal.indexB + 1}コマ目の時間が重複しています`,
    }
  }

  return { ok: true, sessions }
}

async function fetchSessionsForDay(
  dayId: string,
): Promise<ClassScheduleSession[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_schedule_sessions')
    .select('*')
    .eq('day_id', dayId)
  return (data as ClassScheduleSession[] | null) ?? []
}

export async function createClassScheduleDay(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayFields = parseDayFields({
    schedule_date: String(formData.get('scheduleDate') ?? ''),
    venue_name: String(formData.get('venueName') ?? ''),
    address: String(formData.get('address') ?? ''),
    map_url: String(formData.get('mapUrl') ?? ''),
    room_note: String(formData.get('roomNote') ?? ''),
  })
  if (!dayFields.ok) return { error: dayFields.error }

  const sessionsResult = parseSessionsFromFormData(formData)
  if (!sessionsResult.ok) return { error: sessionsResult.error }

  const supabase = await createClient()
  const { data: day, error: dayError } = await supabase
    .from('class_schedule_days')
    .insert({
      ...dayFields.day,
      status: 'scheduled',
      created_by: access.profile.id,
      updated_by: access.profile.id,
    })
    .select('id')
    .single<{ id: string }>()

  if (dayError || !day) {
    if (dayError?.code === '23505') {
      return { error: '同じ日付の授業予定が既にあります' }
    }
    return { error: '授業日の登録に失敗しました' }
  }

  const { error: sessionsError } = await supabase.from('class_schedule_sessions').insert(
    sessionsResult.sessions.map((session) => ({
      day_id: day.id,
      start_time: session.start_time,
      end_time: session.end_time,
      subject: session.subject,
      note: session.note,
      status: 'scheduled',
    })),
  )

  if (sessionsError) {
    await supabase.from('class_schedule_days').delete().eq('id', day.id)
    if (sessionsError.code === '23P01') {
      return { error: 'コマの時間が重複しています' }
    }
    return { error: 'コマの登録に失敗しました' }
  }

  // Notifications (commit 2): optional fan-out when notify_revision increments.
  revalidateClassSchedulePaths(day.id)
  return { success: true, successMessage: '授業予定を登録しました' }
}

export async function updateClassScheduleDay(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const dayFields = parseDayFields({
    schedule_date: String(formData.get('scheduleDate') ?? ''),
    venue_name: String(formData.get('venueName') ?? ''),
    address: String(formData.get('address') ?? ''),
    map_url: String(formData.get('mapUrl') ?? ''),
    room_note: String(formData.get('roomNote') ?? ''),
  })
  if (!dayFields.ok) return { error: dayFields.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      ...dayFields.day,
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) {
    if (error.code === '23505') {
      return { error: '同じ日付の授業予定が既にあります' }
    }
    return { error: '授業日の更新に失敗しました' }
  }

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: '会場情報を更新しました' }
}

export async function addClassScheduleSession(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const parsed = parseSessionDraft({
    start_time: String(formData.get('startTime') ?? ''),
    end_time: String(formData.get('endTime') ?? ''),
    subject: String(formData.get('subject') ?? ''),
    note: String(formData.get('note') ?? ''),
  })
  if (!parsed.ok) return { error: parsed.error }

  const existing = await fetchSessionsForDay(dayId)
  if (
    hasOverlappingScheduledSession(
      { ...parsed.session, status: 'scheduled' },
      existing,
    )
  ) {
    return { error: '既存のコマと時間が重複しています' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('class_schedule_sessions').insert({
    day_id: dayId,
    start_time: parsed.session.start_time,
    end_time: parsed.session.end_time,
    subject: parsed.session.subject,
    note: parsed.session.note,
    status: 'scheduled',
  })

  if (error) {
    if (error.code === '23P01') return { error: '既存のコマと時間が重複しています' }
    return { error: 'コマの追加に失敗しました' }
  }

  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを追加しました' }
}

export async function updateClassScheduleSession(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const sessionId = String(formData.get('sessionId') ?? '').trim()
  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!sessionId || !dayId) return { error: 'コマが見つかりません' }

  const parsed = parseSessionDraft({
    start_time: String(formData.get('startTime') ?? ''),
    end_time: String(formData.get('endTime') ?? ''),
    subject: String(formData.get('subject') ?? ''),
    note: String(formData.get('note') ?? ''),
  })
  if (!parsed.ok) return { error: parsed.error }

  const existing = await fetchSessionsForDay(dayId)
  const current = existing.find((s) => s.id === sessionId)
  if (!current) return { error: 'コマが見つかりません' }

  if (
    current.status === 'scheduled' &&
    hasOverlappingScheduledSession(
      { ...parsed.session, id: sessionId, status: 'scheduled' },
      existing,
      sessionId,
    )
  ) {
    return { error: '既存のコマと時間が重複しています' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .update({
      start_time: parsed.session.start_time,
      end_time: parsed.session.end_time,
      subject: parsed.session.subject,
      note: parsed.session.note,
    })
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) {
    if (error.code === '23P01') return { error: '既存のコマと時間が重複しています' }
    return { error: 'コマの更新に失敗しました' }
  }

  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを更新しました' }
}

export async function cancelClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'cancelled',
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) return { error: '授業日の中止に失敗しました' }

  // Notifications stub (commit 2)
  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: '授業日を中止しました' }
}

export async function uncancelClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'scheduled',
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) return { error: '授業日の再開に失敗しました' }

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: '授業日を再開しました' }
}

export async function cancelClassScheduleSession(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const sessionId = String(formData.get('sessionId') ?? '').trim()
  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!sessionId || !dayId) return { error: 'コマが見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) return { error: 'コマの中止に失敗しました' }

  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを中止しました' }
}

export async function uncancelClassScheduleSession(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const sessionId = String(formData.get('sessionId') ?? '').trim()
  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!sessionId || !dayId) return { error: 'コマが見つかりません' }

  const existing = await fetchSessionsForDay(dayId)
  const current = existing.find((s) => s.id === sessionId)
  if (!current) return { error: 'コマが見つかりません' }

  if (
    hasOverlappingScheduledSession(
      { ...current, status: 'scheduled' },
      existing,
      sessionId,
    )
  ) {
    return { error: '再開すると他のコマと時間が重複します' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .update({ status: 'scheduled' })
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) {
    if (error.code === '23P01') {
      return { error: '再開すると他のコマと時間が重複します' }
    }
    return { error: 'コマの再開に失敗しました' }
  }

  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを再開しました' }
}

export async function deleteClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase.from('class_schedule_days').delete().eq('id', dayId)

  if (error) return { error: '授業日の削除に失敗しました' }

  revalidateClassSchedulePaths()
  return { success: true, successMessage: '誤登録の授業日を削除しました' }
}

export async function deleteClassScheduleSession(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const sessionId = String(formData.get('sessionId') ?? '').trim()
  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!sessionId || !dayId) return { error: 'コマが見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) return { error: 'コマの削除に失敗しました' }

  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを削除しました' }
}
