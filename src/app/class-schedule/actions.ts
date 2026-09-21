'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/class-schedule/access'
import {
  CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY,
  isWithinSessionLimit,
  requireAdminClassScheduleRpcClient,
} from '@/lib/class-schedule/rpc-auth'
import {
  CREATE_CLASS_SCHEDULE_RPC_NAME,
  buildCreateClassScheduleRpcArgs,
  createClassScheduleRpcArgKeyCount,
  createClassScheduleRpcDiagnostic,
  mapClassScheduleDbError,
} from '@/lib/class-schedule/create-rpc'
import {
  findFirstInternalOverlap,
  hasOverlappingScheduledSession,
} from '@/lib/class-schedule/overlap'
import { parseDayFields, parseSessionDraft } from '@/lib/class-schedule/validation'
import {
  classScheduleDayFieldsChanged,
  classScheduleSessionFieldsChanged,
} from '@/lib/class-schedule/notify-change'
import { resolveLocationDetailsText } from '@/lib/class-schedule/location-details'
import {
  classScheduleNotifySuccessMessage,
  deliverClassScheduleNotifications,
} from '@/lib/class-schedule/class-schedule-orchestrator'
import {
  resolveClassScheduleCreateFlashKind,
  resolveClassScheduleNotifyFlashOutcome,
  type ClassScheduleNotifyFlashOutcome,
} from '@/lib/class-schedule/flash-toast'
import { setFlashToastCookie } from '@/lib/toast/flash-toast-server'
import type { ClassScheduleNotifyKind } from '@/lib/class-schedule/class-schedule-email'
import {
  resolveAttendeeChangeNotifyAudience,
  resolveSessionNotifyAudience,
  type SessionAudienceSnapshot,
} from '@/lib/class-schedule/notify-audience'
import type { ClassScheduleDay, ClassScheduleSession } from '@/types/class-schedule'

export type ClassScheduleActionState = {
  error?: string
  success?: boolean
  successMessage?: string
  /** True when the schedule row saved but notification fan-out had failures. */
  notifyPartialFailure?: boolean
  /** Fixed flash outcome for navigation toasts (never free-form). */
  notifyFlashOutcome?: ClassScheduleNotifyFlashOutcome
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

type ParsedSessionDraft = {
  start_time: string
  end_time: string
  subject: string
  note: string | null
  mode: 'course' | 'freeform'
  courseUnitId: string | null
  attendeeIds: string[]
}

function parseSessionsFromFormData(formData: FormData): {
  ok: true
  sessions: ParsedSessionDraft[]
} | { ok: false; error: string } {
  const starts = formData.getAll('sessionStartTime').map(String)
  const ends = formData.getAll('sessionEndTime').map(String)
  const subjects = formData.getAll('sessionSubject').map(String)
  const notes = formData.getAll('sessionNote').map(String)
  const modes = formData.getAll('sessionMode').map(String)
  const courseUnitIds = formData.getAll('courseUnitId').map(String)

  const count = Math.max(
    starts.length,
    ends.length,
    subjects.length,
    notes.length,
    modes.length,
  )
  if (count === 0) {
    return { ok: false, error: 'コマを1つ以上追加してください' }
  }
  if (!isWithinSessionLimit(count)) {
    return {
      ok: false,
      error: `コマは1日あたり最大${CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY}件までです`,
    }
  }

  const sessions: ParsedSessionDraft[] = []

  for (let i = 0; i < count; i += 1) {
    const courseUnitId = (courseUnitIds[i] ?? '').trim()
    const modeRaw = modes[i]
    const mode: 'course' | 'freeform' =
      modeRaw === 'course'
        ? 'course'
        : modeRaw === 'freeform'
          ? 'freeform'
          : courseUnitId
            ? 'course'
            : 'freeform'
    const attendeeIds = formData
      .getAll(`attendeeIds_${i}`)
      .map(String)
      .filter(Boolean)

    if (mode === 'course') {
      if (!courseUnitId) {
        return { ok: false, error: `${i + 1}コマ目: 授業番号を選択してください` }
      }
      if (attendeeIds.length === 0) {
        return { ok: false, error: `${i + 1}コマ目: 対象生徒を選択してください` }
      }
    }

    const parsed = parseSessionDraft({
      start_time: starts[i] ?? '',
      end_time: ends[i] ?? '',
      // Course subject is generated server-side after unit lookup.
      subject: mode === 'course' ? '共通授業' : (subjects[i] ?? ''),
      note: notes[i] ?? '',
    })
    if (!parsed.ok) {
      return { ok: false, error: `${i + 1}コマ目: ${parsed.error}` }
    }
    sessions.push({
      ...parsed.session,
      mode,
      courseUnitId: mode === 'course' ? courseUnitId : null,
      attendeeIds: mode === 'course' ? attendeeIds : [],
    })
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

async function loadSessionAudienceSnapshot(
  sessionId: string,
): Promise<SessionAudienceSnapshot | null> {
  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return null
  const { data: session } = await gate.admin
    .from('class_schedule_sessions')
    .select('id, audience_type')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return null
  const audienceType =
    (session.audience_type as 'all_kisotsu' | 'targeted' | null) ?? 'all_kisotsu'
  if (audienceType === 'all_kisotsu') {
    return { sessionId, audienceType, attendeeIds: [] }
  }
  const { data: attendees } = await gate.admin
    .from('class_schedule_session_attendees')
    .select('student_id')
    .eq('session_id', sessionId)
  return {
    sessionId,
    audienceType: 'targeted',
    attendeeIds: (attendees ?? []).map((a) => String(a.student_id)),
  }
}

async function resolveCourseUnitDisplaySubject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  courseUnitId: string,
): Promise<string | null> {
  const { data: unit } = await admin
    .from('class_course_units')
    .select('subject, term, track, seq_no')
    .eq('id', courseUnitId)
    .maybeSingle()
  if (!unit) return null
  const { buildClassCourseDisplayName } = await import('@/lib/class-course/catalog')
  return buildClassCourseDisplayName({
    subject: unit.subject as never,
    term: unit.term as never,
    track: unit.track as never,
    seqNo: Number(unit.seq_no),
  })
}

async function notifyAfterSave(params: {
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
  savedMessage: string
  /** When set, only these students. Omit = day aggregate (venue/day cancel). */
  recipientStudentIds?: readonly string[]
}): Promise<ClassScheduleActionState> {
  let successMessage = params.savedMessage
  let notifyPartialFailure = false
  let notifyFlashOutcome: ClassScheduleNotifyFlashOutcome = 'ok'

  try {
    const summary = await deliverClassScheduleNotifications({
      dayId: params.dayId,
      notifyRevision: params.notifyRevision,
      kind: params.kind,
      recipientStudentIds: params.recipientStudentIds,
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

    notifyFlashOutcome = resolveClassScheduleNotifyFlashOutcome({
      mode: summary.mode,
      notifyPartialFailure,
      pushSucceeded: summary.pushSucceeded,
      emailFallbackSucceeded: summary.emailFallbackSucceeded,
      legacyEmailSentCount: summary.legacyEmailSentCount,
      alreadyCompleted: summary.alreadyCompleted,
    })

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
    notifyFlashOutcome = 'failed'
  }

  revalidateClassSchedulePaths(params.dayId)
  return {
    success: true,
    successMessage,
    notifyFlashOutcome,
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
    location_details: String(formData.get('locationDetails') ?? ''),
  })
  if (!dayFields.ok) return { error: dayFields.error }

  const sessionsResult = parseSessionsFromFormData(formData)
  if (!sessionsResult.ok) return { error: sessionsResult.error }

  // Atomic create: day + sessions + optional course links/attendees in one TX (069).
  const rpcArgs = buildCreateClassScheduleRpcArgs({
    schedule_date: dayFields.day.schedule_date,
    venue_name: dayFields.day.venue_name,
    location_details: dayFields.day.location_details,
    sessions: sessionsResult.sessions.map((s) => ({
      start_time: s.start_time,
      end_time: s.end_time,
      subject: s.subject,
      note: s.note,
      ...(s.mode === 'course' && s.courseUnitId
        ? { course_unit_id: s.courseUnitId, attendee_ids: s.attendeeIds }
        : {}),
    })),
    actorId: gate.profile.id,
  })
  const argKeyCount = createClassScheduleRpcArgKeyCount(rpcArgs)
  const sessionCount = rpcArgs.p_sessions.length

  const { data, error } = await gate.admin.rpc(
    CREATE_CLASS_SCHEDULE_RPC_NAME,
    rpcArgs,
  )

  if (error || !data) {
    console.error(
      '[class-schedule] create failed:',
      createClassScheduleRpcDiagnostic({
        phase: 'create_rpc',
        error: error ?? null,
        argKeyCount,
        sessionCount,
      }),
    )
    return { error: mapClassScheduleDbError(error ?? {}) }
  }

  const row = Array.isArray(data) ? data[0] : data
  const dayId = row && typeof row === 'object' && 'day_id' in row ? String(row.day_id) : ''
  const notifyRevisionRaw =
    row && typeof row === 'object' && 'notify_revision' in row
      ? Number(row.notify_revision)
      : NaN

  if (!dayId || !Number.isFinite(notifyRevisionRaw)) {
    console.error(
      '[class-schedule] create failed:',
      createClassScheduleRpcDiagnostic({
        phase: 'empty_result',
        argKeyCount,
        sessionCount,
      }),
    )
    return { error: '授業予定の登録に失敗しました' }
  }

  // Day create: day-level audience (includes all_kisotsu expansion when present).
  const result = await notifyAfterSave({
    dayId,
    notifyRevision: notifyRevisionRaw,
    kind: 'create',
    savedMessage: '授業予定を登録しました',
  })

  if (result.success) {
    await setFlashToastCookie(
      resolveClassScheduleCreateFlashKind(
        result.notifyPartialFailure,
        result.notifyFlashOutcome ?? 'ok',
      ),
    )
  }

  return result
}

export async function updateClassScheduleDay(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const dayFields = parseDayFields({
    schedule_date: String(formData.get('scheduleDate') ?? ''),
    venue_name: String(formData.get('venueName') ?? ''),
    location_details: String(formData.get('locationDetails') ?? ''),
  })
  if (!dayFields.ok) return { error: dayFields.error }

  const existing = await fetchDay(dayId)
  if (!existing) return { error: '授業日が見つかりません' }

  const before = {
    schedule_date: existing.schedule_date,
    venue_name: existing.venue_name,
    location_details: resolveLocationDetailsText(existing),
  }
  const changed = classScheduleDayFieldsChanged(before, dayFields.day)
  if (!changed) {
    revalidateClassSchedulePaths(dayId)
    return { success: true, successMessage: '変更はありません' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('class_schedule_days')
    .update({
      schedule_date: dayFields.day.schedule_date,
      venue_name: dayFields.day.venue_name,
      location_details: dayFields.day.location_details,
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
  const access = await requireSuperAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: '中止中の授業日にはコマを追加できません。先に再開してください' }
  }

  const courseUnitIdEarly = String(formData.get('courseUnitId') ?? '').trim()
  const sessionMode = String(formData.get('sessionMode') ?? '').trim()
  const isCourse = sessionMode === 'course' || Boolean(courseUnitIdEarly)
  const parsed = parseSessionDraft({
    start_time: String(formData.get('startTime') ?? ''),
    end_time: String(formData.get('endTime') ?? ''),
    subject: isCourse
      ? '共通授業'
      : String(formData.get('subject') ?? formData.get('sessionSubject') ?? ''),
    note: String(formData.get('note') ?? formData.get('sessionNote') ?? ''),
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

  const attendeeIds = formData.getAll('attendeeIds').map(String).filter(Boolean)
  let subject = parsed.session.subject
  let resolvedCourseUnitId: string | null = null

  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { error: gate.error }

  if (isCourse) {
    if (!courseUnitIdEarly) {
      return { error: '授業番号を選択してください' }
    }
    const display = await resolveCourseUnitDisplaySubject(
      gate.admin,
      courseUnitIdEarly,
    )
    if (!display) return { error: '共通授業が見つかりません' }
    subject = display
    resolvedCourseUnitId = courseUnitIdEarly
    if (attendeeIds.length === 0) {
      return { error: '対象生徒を選択してください' }
    }
  }

  const { data, error } = await gate.admin.rpc(
    'add_class_schedule_session_with_course',
    {
      p_day_id: dayId,
      p_start_time: parsed.session.start_time,
      p_end_time: parsed.session.end_time,
      p_subject: subject,
      p_note: parsed.session.note,
      p_course_unit_id: resolvedCourseUnitId,
      p_attendee_ids: resolvedCourseUnitId ? attendeeIds : null,
      p_actor_id: gate.profile.id,
    },
  )

  if (error || !data) {
    return { error: mapClassScheduleDbError(error ?? {}) }
  }

  const insertedId =
    data && typeof data === 'object' && 'session_id' in data
      ? String((data as { session_id: string }).session_id)
      : ''

  const bumped = await bumpNotifyRevision(dayId, access.profile.id)
  if (!bumped.ok) {
    revalidateClassSchedulePaths(dayId)
    return {
      success: true,
      successMessage: 'コマを追加しました（通知を送信できませんでした）',
      notifyPartialFailure: true,
    }
  }

  const audience = resolveSessionNotifyAudience({
    sessionId: insertedId,
    audienceType: resolvedCourseUnitId ? 'targeted' : 'all_kisotsu',
    attendeeIds: resolvedCourseUnitId ? attendeeIds : [],
  })
  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを追加しました',
    recipientStudentIds: audience === 'all_kisotsu' ? undefined : audience,
  })
}

export async function updateClassScheduleSession(
  _prev: ClassScheduleActionState,
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { error: access.error }

  const sessionId = String(formData.get('sessionId') ?? '').trim()
  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!sessionId || !dayId) return { error: 'コマが見つかりません' }

  const day = await fetchDay(dayId)
  if (!day) return { error: '授業日が見つかりません' }
  if (day.status === 'cancelled') {
    return { error: '中止中の授業日のコマは変更できません。先に再開してください' }
  }

  const existing = await fetchSessionsForDay(dayId)
  const current = existing.find((s) => s.id === sessionId)
  if (!current) return { error: 'コマが見つかりません' }

  const beforeAudience = await loadSessionAudienceSnapshot(sessionId)
  const beforeAttendeeIds = beforeAudience?.attendeeIds ?? []

  const courseUnitIdForm = String(formData.get('courseUnitId') ?? '').trim()
  const sessionMode = String(formData.get('sessionMode') ?? '').trim()
  const attendeeIdsFromForm = formData.getAll('attendeeIds').map(String).filter(Boolean)

  const parsed = parseSessionDraft({
    start_time: String(formData.get('startTime') ?? ''),
    end_time: String(formData.get('endTime') ?? ''),
    subject:
      current.course_unit_id || (sessionMode === 'course' && courseUnitIdForm)
        ? current.subject || '共通授業'
        : String(formData.get('subject') ?? formData.get('sessionSubject') ?? ''),
    note: String(formData.get('note') ?? formData.get('sessionNote') ?? ''),
    originalStart: current.start_time,
    originalEnd: current.end_time,
  })
  if (!parsed.ok) return { error: parsed.error }

  const fieldsChanged = classScheduleSessionFieldsChanged(current, parsed.session)
  const linkingNewCourse =
    !current.course_unit_id && sessionMode === 'course' && Boolean(courseUnitIdForm)
  const managingAttendees =
    sessionMode === 'course' || Boolean(current.course_unit_id)
  const attendeesChanged = (() => {
    if (!managingAttendees) return false
    const before = new Set(beforeAttendeeIds)
    const after = new Set(attendeeIdsFromForm)
    if (before.size !== after.size) return true
    for (const id of before) if (!after.has(id)) return true
    return false
  })()

  if (!fieldsChanged && !attendeesChanged && !linkingNewCourse) {
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

  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { error: gate.error }

  let nextSubject = parsed.session.subject
  let nextCourseUnitId = current.course_unit_id ?? null

  if (linkingNewCourse && courseUnitIdForm) {
    const subject = await resolveCourseUnitDisplaySubject(gate.admin, courseUnitIdForm)
    if (!subject) return { error: '共通授業が見つかりません' }
    if (attendeeIdsFromForm.length === 0) {
      return { error: '対象生徒を選択してください' }
    }
    nextSubject = subject
    nextCourseUnitId = courseUnitIdForm
  } else if (current.course_unit_id) {
    nextSubject = current.subject
  }

  const { error } = await gate.admin.rpc(
    'update_class_schedule_session_with_course',
    {
      p_session_id: sessionId,
      p_day_id: dayId,
      p_start_time: parsed.session.start_time,
      p_end_time: parsed.session.end_time,
      p_subject: nextSubject,
      p_note: parsed.session.note,
      p_course_unit_id: linkingNewCourse ? nextCourseUnitId : current.course_unit_id,
      p_attendee_ids: managingAttendees ? attendeeIdsFromForm : null,
      p_manage_attendees: managingAttendees,
      p_actor_id: gate.profile.id,
    },
  )

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('attendance record')) {
      return {
        error:
          '実施または欠席の記録がある生徒は、先に未実施へ訂正してから対象外してください',
      }
    }
    return { error: mapClassScheduleDbError(error) }
  }

  let notifyRecipientIds: string[] | undefined
  if (managingAttendees && (current.course_unit_id || linkingNewCourse)) {
    notifyRecipientIds = resolveAttendeeChangeNotifyAudience({
      beforeIds: beforeAttendeeIds,
      afterIds: attendeeIdsFromForm,
    })
  } else {
    const afterSnap = await loadSessionAudienceSnapshot(sessionId)
    const resolved = afterSnap
      ? resolveSessionNotifyAudience(afterSnap)
      : 'all_kisotsu'
    notifyRecipientIds = resolved === 'all_kisotsu' ? undefined : resolved
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
    recipientStudentIds: notifyRecipientIds,
  })
}

export async function cancelClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
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
  const access = await requireSuperAdmin()
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
  const access = await requireSuperAdmin()
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

  const beforeSnap = await loadSessionAudienceSnapshot(sessionId)
  const sessionAudience = beforeSnap
    ? resolveSessionNotifyAudience(beforeSnap)
    : 'all_kisotsu'

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
    recipientStudentIds:
      sessionAudience === 'all_kisotsu' ? undefined : sessionAudience,
  })
}

export async function uncancelClassScheduleSession(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
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

  const afterSnap = await loadSessionAudienceSnapshot(sessionId)
  const sessionAudience = afterSnap
    ? resolveSessionNotifyAudience(afterSnap)
    : 'all_kisotsu'

  return notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを再開しました',
    recipientStudentIds:
      sessionAudience === 'all_kisotsu' ? undefined : sessionAudience,
  })
}

export async function deleteClassScheduleDay(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { error: access.error }

  const dayId = String(formData.get('dayId') ?? '').trim()
  if (!dayId) return { error: '授業日が見つかりません' }

  const supabase = await createClient()
  const { error } = await supabase.from('class_schedule_days').delete().eq('id', dayId)

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('attendance record')) {
      return {
        error:
          '実施または欠席の記録があるコマがあるため削除できません。先に未実施へ訂正してください',
      }
    }
    return { error: '授業日の削除に失敗しました' }
  }

  // Misregistration delete: NO notify
  await setFlashToastCookie('class_schedule_day_deleted')
  revalidateClassSchedulePaths()
  return { success: true, successMessage: '誤登録を削除しました' }
}

export async function deleteClassScheduleSession(
  formData: FormData,
): Promise<ClassScheduleActionState> {
  const access = await requireSuperAdmin()
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

  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('attendance record')) {
      return {
        error:
          '実施または欠席の記録があるためコマを削除できません。先に未実施へ訂正してください',
      }
    }
    return { error: 'コマの削除に失敗しました' }
  }

  // Misregistration delete: NO notify
  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: '誤登録のコマを削除しました' }
}
