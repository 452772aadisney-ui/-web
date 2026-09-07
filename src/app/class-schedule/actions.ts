'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/class-schedule/access'
import {
  CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY,
  isWithinSessionLimit,
  requireAdminClassScheduleRpcClient,
} from '@/lib/class-schedule/rpc-auth'
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
  if (!isWithinSessionLimit(count)) {
    return {
      ok: false,
      error: `コマは1日あたり最大${CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY}件までです`,
    }
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
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false }
  // updatedBy must be the verified admin from requireAdmin — never a client-supplied id.
  if (updatedBy !== gate.profile.id) return { ok: false }

  const { data, error } = await gate.admin.rpc('bump_class_schedule_notify_revision', {
    p_day_id: dayId,
    p_updated_by: gate.profile.id,
  })

  if (error || data == null) return { ok: false }
  const revision = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(revision)) return { ok: false }
  return { ok: true, notifyRevision: revision }
}

function mapClassScheduleDbError(error: {
  code?: string
  message?: string
}): string {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === '23505' || /duplicate key|unique/i.test(message)) {
    return '同じ日付の授業予定が既にあります'
  }
  if (code === '23P01' || /overlap/i.test(message)) {
    return '既存のコマと時間が重複しています'
  }
  if (code === '22023' || /at least one session|sessions must be|too many sessions/i.test(message)) {
    return /too many/i.test(message)
      ? `コマは1日あたり最大${CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY}件までです`
      : 'コマを1つ以上追加してください'
  }
  if (/end_time must be after|invalid session time|subject is required/i.test(message)) {
    return 'コマの内容が不正です'
  }
  if (code === '42501' || /permission denied/i.test(message)) {
    return '管理者権限が必要です'
  }
  return '授業予定の保存に失敗しました'
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
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { error: gate.error }

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

  const { data, error } = await gate.admin.rpc('create_class_schedule_day_with_sessions', {
    p_schedule_date: dayFields.day.schedule_date,
    p_venue_name: dayFields.day.venue_name,
    p_address: dayFields.day.address,
    p_map_url: dayFields.day.map_url,
    p_room_note: dayFields.day.room_note,
    p_sessions: sessionsResult.sessions.map((session) => ({
      start_time: session.start_time,
      end_time: session.end_time,
      subject: session.subject,
      note: session.note,
    })),
    p_actor_id: gate.profile.id,
  })

  if (error || !data) {
    return { error: mapClassScheduleDbError(error ?? {}) }
  }

  const row = Array.isArray(data) ? data[0] : data
  const dayId = row && typeof row === 'object' && 'day_id' in row ? String(row.day_id) : ''
  const notifyRevisionRaw =
    row && typeof row === 'object' && 'notify_revision' in row
      ? Number(row.notify_revision)
      : NaN

  if (!dayId || !Number.isFinite(notifyRevisionRaw)) {
    return { error: '授業予定の登録に失敗しました' }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: notifyRevisionRaw,
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
  const { data: updated, error } = await supabase
    .from('class_schedule_days')
    .update({
      ...dayFields.day,
      updated_by: access.profile.id,
    })
    .eq('id', dayId)
    .eq('notify_revision', existing.notify_revision)
    .select('id')

  if (error) {
    return { error: mapClassScheduleDbError(error) }
  }
  if (!updated || updated.length === 0) {
    return { error: '他の操作と競合しました。画面を再読み込みしてください' }
  }

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: '会場情報を更新しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
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

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: '中止中の授業日にはコマを追加できません。先に再開してください' }
  }

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
    return { error: mapClassScheduleDbError(error) }
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

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: '中止中の授業日のコマは変更できません。先に再開してください' }
  }

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
    return { error: mapClassScheduleDbError(error) }
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

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'cancelled',
      updated_by: access.profile.id,
    })
    .eq('id', dayId)
    .eq('status', 'scheduled')
    .select('id')

  if (error) return { error: '授業日の中止に失敗しました' }
  if (!updated || updated.length === 0) {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: '授業日を中止しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
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

  const sessions = await fetchSessionsForDay(dayId)
  const scheduled = sessions.filter((s) => s.status === 'scheduled')
  const internal = findFirstInternalOverlap(scheduled)
  if (internal) {
    return { error: '再開するとコマの時間が重複します' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('class_schedule_days')
    .update({
      status: 'scheduled',
      updated_by: access.profile.id,
    })
    .eq('id', dayId)
    .eq('status', 'cancelled')
    .select('id')

  if (error) return { error: '授業日の再開に失敗しました' }
  if (!updated || updated.length === 0) {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: '授業日を再開しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
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

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: 'この日はすでに中止です' }
  }

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

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: '中止中の授業日では個別コマを再開できません。先にこの日を再開してください' }
  }

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
    return {
      error:
        error.code === '23P01'
          ? '再開すると他のコマと時間が重複します'
          : 'コマの再開に失敗しました',
    }
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

  const existing = await fetchSessionsForDay(dayId)
  if (existing.length <= 1) {
    return {
      error:
        '最後のコマは削除できません。授業日全体を「誤登録を削除」してください',
    }
  }

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
