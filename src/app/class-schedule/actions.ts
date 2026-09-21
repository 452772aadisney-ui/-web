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

async function attachCourseLinksAfterCreate(params: {
  dayId: string
  drafts: ParsedSessionDraft[]
  actorId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const hasCourse = params.drafts.some((d) => d.mode === 'course')
  if (!hasCourse) return { ok: true }

  const gate = await requireAdminClassScheduleRpcClient()
  if (!gate.ok) return { ok: false, error: gate.error }
  if (gate.profile.id !== params.actorId) {
    return { ok: false, error: '権限がありません' }
  }

  const { data: rows, error } = await gate.admin
    .from('class_schedule_sessions')
    .select('id, start_time, end_time, subject')
    .eq('day_id', params.dayId)
    .order('start_time', { ascending: true })

  if (error || !rows || rows.length !== params.drafts.length) {
    return { ok: false, error: 'コマの授業紐づけに失敗しました' }
  }

  for (let i = 0; i < params.drafts.length; i += 1) {
    const draft = params.drafts[i]!
    const row = rows[i]!
    if (draft.mode !== 'course' || !draft.courseUnitId) continue

    const subject = await resolveCourseUnitDisplaySubject(
      gate.admin,
      draft.courseUnitId,
    )
    if (!subject) return { ok: false, error: '共通授業が見つかりません' }

    const { error: updError } = await gate.admin
      .from('class_schedule_sessions')
      .update({
        course_unit_id: draft.courseUnitId,
        audience_type: 'targeted',
        subject,
      })
      .eq('id', row.id)

    if (updError) {
      return { ok: false, error: 'コマの授業紐づけに失敗しました' }
    }

    const { error: attendeeError } = await gate.admin
      .from('class_schedule_session_attendees')
      .insert(
        draft.attendeeIds.map((studentId) => ({
          session_id: row.id,
          student_id: studentId,
        })),
      )
    if (attendeeError) {
      return { ok: false, error: '対象生徒の保存に失敗しました' }
    }
  }

  return { ok: true }
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

  // Atomic create only via service_role RPC — no prior table writes (no partial rows).
  const rpcArgs = buildCreateClassScheduleRpcArgs({
    schedule_date: dayFields.day.schedule_date,
    venue_name: dayFields.day.venue_name,
    location_details: dayFields.day.location_details,
    sessions: sessionsResult.sessions.map((s) => ({
      start_time: s.start_time,
      end_time: s.end_time,
      subject: s.subject,
      note: s.note,
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

  const linked = await attachCourseLinksAfterCreate({
    dayId,
    drafts: sessionsResult.sessions,
    actorId: gate.profile.id,
  })
  if (!linked.ok) {
    console.error('[class-schedule] course link after create failed')
    return { error: linked.error }
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

  const supabase = await createClient()
  const courseUnitId = courseUnitIdEarly
  const attendeeIds = formData.getAll('attendeeIds').map(String).filter(Boolean)

  let subject = parsed.session.subject
  let audienceType: 'all_kisotsu' | 'targeted' = 'all_kisotsu'
  let resolvedCourseUnitId: string | null = null

  if (isCourse) {
    if (!courseUnitId) {
      return { error: '授業番号を選択してください' }
    }
    const adminGate = await requireAdminClassScheduleRpcClient()
    if (!adminGate.ok) return { error: adminGate.error }
    const { data: unit } = await adminGate.admin
      .from('class_course_units')
      .select('id, academic_year, term, subject, track, seq_no')
      .eq('id', courseUnitId)
      .maybeSingle()
    if (!unit) return { error: '共通授業が見つかりません' }
    const { buildClassCourseDisplayName } = await import('@/lib/class-course/catalog')
    subject = buildClassCourseDisplayName({
      subject: unit.subject as never,
      term: unit.term as never,
      track: unit.track as never,
      seqNo: Number(unit.seq_no),
    })
    audienceType = 'targeted'
    resolvedCourseUnitId = String(unit.id)
    if (attendeeIds.length === 0) {
      return { error: '対象生徒を選択してください' }
    }
  }

  const { data: inserted, error } = await supabase
    .from('class_schedule_sessions')
    .insert({
      day_id: dayId,
      start_time: parsed.session.start_time,
      end_time: parsed.session.end_time,
      subject,
      note: parsed.session.note,
      status: 'scheduled',
      course_unit_id: resolvedCourseUnitId,
      audience_type: audienceType,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    return { error: mapClassScheduleDbError(error) }
  }

  if (resolvedCourseUnitId && inserted?.id && attendeeIds.length > 0) {
    const adminGate = await requireAdminClassScheduleRpcClient()
    if (!adminGate.ok) return { error: adminGate.error }
    const { error: attendeeError } = await adminGate.admin
      .from('class_schedule_session_attendees')
      .insert(
        attendeeIds.map((studentId) => ({
          session_id: inserted.id,
          student_id: studentId,
        })),
      )
    if (attendeeError) {
      console.error('[class-schedule] attendee insert failed', attendeeError.code)
      return { error: '対象生徒の保存に失敗しました' }
    }
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

  // Targeted session: notify only this session's attendees (not day-wide all_kisotsu).
  const audience = resolveSessionNotifyAudience({
    sessionId: String(inserted?.id ?? ''),
    audienceType,
    attendeeIds,
  })
  const notifyState = await notifyAfterSave({
    dayId,
    notifyRevision: bumped.notifyRevision,
    kind: 'change',
    savedMessage: 'コマを追加しました',
    recipientStudentIds: audience === 'all_kisotsu' ? undefined : audience,
  })
  return notifyState
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
  let nextAudience = current.audience_type ?? 'all_kisotsu'

  if (linkingNewCourse && courseUnitIdForm) {
    const subject = await resolveCourseUnitDisplaySubject(gate.admin, courseUnitIdForm)
    if (!subject) return { error: '共通授業が見つかりません' }
    if (attendeeIdsFromForm.length === 0) {
      return { error: '対象生徒を選択してください' }
    }
    nextSubject = subject
    nextCourseUnitId = courseUnitIdForm
    nextAudience = 'targeted'
  } else if (current.course_unit_id) {
    nextSubject = current.subject
    nextAudience = 'targeted'
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_schedule_sessions')
    .update({
      start_time: parsed.session.start_time,
      end_time: parsed.session.end_time,
      subject: nextSubject,
      note: parsed.session.note,
      course_unit_id: nextCourseUnitId,
      audience_type: nextAudience,
    })
    .eq('id', sessionId)
    .eq('day_id', dayId)

  if (error) {
    return { error: mapClassScheduleDbError(error) }
  }

  let notifyRecipientIds: string[] | undefined

  if (managingAttendees && (current.course_unit_id || linkingNewCourse)) {
    if (attendeeIdsFromForm.length === 0) {
      return { error: '対象生徒を選択してください' }
    }
    const desired = new Set(attendeeIdsFromForm)
    const toRemove = beforeAttendeeIds.filter((id) => !desired.has(id))
    const beforeSet = new Set(beforeAttendeeIds)
    const toAdd = attendeeIdsFromForm.filter((id) => !beforeSet.has(id))

    for (const studentId of toRemove) {
      const { error: rmError } = await gate.admin.rpc(
        'remove_class_schedule_session_attendee',
        {
          p_session_id: sessionId,
          p_student_id: studentId,
          p_actor_id: gate.profile.id,
        },
      )
      if (rmError) {
        const msg = String(rmError.message ?? '')
        if (msg.includes('attendance record')) {
          return {
            error:
              '実施または欠席の記録がある生徒は、先に未実施へ訂正してから対象外してください',
          }
        }
        return { error: '対象生徒の更新に失敗しました' }
      }
    }

    if (toAdd.length > 0) {
      const { error: addError } = await gate.admin
        .from('class_schedule_session_attendees')
        .insert(
          toAdd.map((studentId) => ({
            session_id: sessionId,
            student_id: studentId,
          })),
        )
      if (addError) return { error: '対象生徒の更新に失敗しました' }
    }

    notifyRecipientIds = resolveAttendeeChangeNotifyAudience({
      beforeIds: beforeAttendeeIds,
      afterIds: attendeeIdsFromForm,
    })
  } else {
    const afterSnap =
      (await loadSessionAudienceSnapshot(sessionId)) ??
      ({
        sessionId,
        audienceType: (nextAudience as 'all_kisotsu' | 'targeted') ?? 'all_kisotsu',
        attendeeIds: beforeAttendeeIds,
      } satisfies SessionAudienceSnapshot)
    const resolved = resolveSessionNotifyAudience(afterSnap)
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

  if (error) return { error: '授業日の削除に失敗しました' }

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

  if (error) return { error: 'コマの削除に失敗しました' }

  // Misregistration delete: NO notify
  await supabase
    .from('class_schedule_days')
    .update({ updated_by: access.profile.id })
    .eq('id', dayId)

  revalidateClassSchedulePaths(dayId)
  return { success: true, successMessage: '誤登録のコマを削除しました' }
}
