'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/class-schedule/access'
import {
  findFirstInternalOverlap,
  hasOverlappingScheduledSession,
} from '@/lib/class-schedule/overlap'
import { parseDayFields, parseSessionDraft } from '@/lib/class-schedule/validation'
import {
  classScheduleDayFieldsChanged,
  classScheduleSessionFieldsChanged,
} from '@/lib/class-schedule/notify-change'
import {
  classScheduleNotifySuccessMessage,
  deliverClassScheduleNotifications,
} from '@/lib/class-schedule/class-schedule-orchestrator'
import type { ClassScheduleNotifyKind } from '@/lib/class-schedule/class-schedule-email'
import type { ClassScheduleDay, ClassScheduleSession } from '@/types/class-schedule'

export type ClassScheduleActionState = {
  error?: string
  success?: boolean
  successMessage?: string
  /** True when the schedule row saved but notification fan-out had failures. */
  notifyPartialFailure?: boolean
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

async function fetchDay(dayId: string): Promise<ClassScheduleDay | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_schedule_days')
    .select('*')
    .eq('id', dayId)
    .maybeSingle<ClassScheduleDay>()
  return data ?? null
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

async function bumpNotifyRevision(
  dayId: string,
  updatedBy: string,
): Promise<{ ok: true; notifyRevision: number } | { ok: false }> {
  const day = await fetchDay(dayId)
  if (!day) return { ok: false }

  const nextRevision = day.notify_revision + 1
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_schedule_days')
    .update({
      notify_revision: nextRevision,
      updated_by: updatedBy,
    })
    .eq('id', dayId)
    .select('notify_revision')
    .single<{ notify_revision: number }>()

  if (error || !data) return { ok: false }
  return { ok: true, notifyRevision: data.notify_revision }
}

async function notifyAfterSave(params: {
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
  savedMessage: string
}): Promise<ClassScheduleActionState> {
  let successMessage = params.savedMessage
  let notifyPartialFailure = false

  try {
    const summary = await deliverClassScheduleNotifications({
      dayId: params.dayId,
      notifyRevision: params.notifyRevision,
      kind: params.kind,
    })
    successMessage = classScheduleNotifySuccessMessage(params.savedMessage, summary)
    notifyPartialFailure =
      summary.mode !== 'dry-run' &&
      (summary.failed > 0 ||
        summary.cannotDeliver > 0 ||
        summary.emailUnprocessedCount > 0 ||
        summary.stalePending > 0 ||
        summary.timedOut ||
        !summary.ok)

    console.info('[class-schedule] notification summary:', {
      mode: summary.mode,
      kind: params.kind,
      recipients: summary.recipients,
      pushSucceeded: summary.pushSucceeded,
      emailFallbackSucceeded: summary.emailFallbackSucceeded,
      preferenceDisabled: summary.preferenceDisabled,
      cannotDeliver: summary.cannotDeliver,
      failed: summary.failed,
      legacyEmailSentCount: summary.legacyEmailSentCount,
      timedOut: summary.timedOut,
      durationMs: summary.durationMs,
    })
  } catch {
    console.error('[class-schedule] notification failed after save')
    successMessage = `${params.savedMessage}（通知を送信できませんでした）`
    notifyPartialFailure = true
  }

  revalidateClassSchedulePaths(params.dayId)
  return {
    success: true,
    successMessage,
    ...(notifyPartialFailure ? { notifyPartialFailure: true } : {}),
  }
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
      notify_revision: 1,
      created_by: access.profile.id,
      updated_by: access.profile.id,
    })
    .select('id, notify_revision')
    .single<{ id: string; notify_revision: number }>()

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

  return notifyAfterSave({
    dayId: day.id,
    notifyRevision: day.notify_revision,
    kind: 'create',
    savedMessage: '授業予定を登録しました',
  })
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

  const existing = await fetchDay(dayId)
  if (!existing) return { error: '授業日が見つかりません' }

  const changed = classScheduleDayFieldsChanged(existing, dayFields.day)
  if (!changed) {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const supabase = await createClient()
  const nextRevision = existing.notify_revision + 1
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      ...dayFields.day,
      notify_revision: nextRevision,
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) {
    if (error.code === '23505') {
      return { error: '同じ日付の授業予定が既にあります' }
    }
    return { error: '授業日の更新に失敗しました' }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: nextRevision,
    kind: 'change',
    savedMessage: '会場情報を更新しました',
  })
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

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: 'コマを追加しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを追加しました',
  })
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

  if (!classScheduleSessionFieldsChanged(current, parsed.session)) {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

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

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: 'コマを更新しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを更新しました',
  })
}

export async function cancelClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const existing = await fetchDay(dayId)
  if (!existing) return { error: '授業日が見つかりません' }
  if (existing.status === 'cancelled') {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const nextRevision = existing.notify_revision + 1
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'cancelled',
      notify_revision: nextRevision,
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) return { error: '授業日の中止に失敗しました' }

  return notifyAfterSave({
    dayId,
    notifyRevision: nextRevision,
    kind: 'cancel',
    savedMessage: '授業日を中止しました',
  })
}

export async function uncancelClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const existing = await fetchDay(dayId)
  if (!existing) return { error: '授業日が見つかりません' }
  if (existing.status === 'scheduled') {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const nextRevision = existing.notify_revision + 1
  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'scheduled',
      notify_revision: nextRevision,
      updated_by: access.profile.id,
    })
    .eq('id', dayId)

  if (error) return { error: '授業日の再開に失敗しました' }

  return notifyAfterSave({
    dayId,
    notifyRevision: nextRevision,
    kind: 'change',
    savedMessage: '授業日を再開しました',
  })
}

export async function cancelClassScheduleSession(
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
  if (current.status === 'cancelled') {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .update({ status: 'cancelled' })
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) return { error: 'コマの中止に失敗しました' }

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: 'コマを中止しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'cancel',
    savedMessage: 'コマを中止しました',
  })
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

  if (current.status === 'scheduled') {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

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

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: 'コマを再開しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを再開しました',
  })
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

  // Misregistration delete: NO notify
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

  // Misregistration delete: NO notify
  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: 'コマを削除しました' }
}
