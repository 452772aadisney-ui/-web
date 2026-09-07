import { CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY } from '@/lib/class-schedule/rpc-auth'

/** Must match public.create_class_schedule_day_with_sessions (057) parameter names. */
export const CREATE_CLASS_SCHEDULE_RPC_NAME =
  'create_class_schedule_day_with_sessions' as const

export const CREATE_CLASS_SCHEDULE_RPC_ARG_KEYS = [
  'p_schedule_date',
  'p_venue_name',
  'p_location_details',
  'p_sessions',
  'p_actor_id',
] as const

export type CreateClassScheduleRpcSession = {
  start_time: string
  end_time: string
  subject: string
  note: string | null
}

export type CreateClassScheduleRpcArgs = {
  p_schedule_date: string
  p_venue_name: string
  p_location_details: string | null
  p_sessions: CreateClassScheduleRpcSession[]
  p_actor_id: string
}

export type ClassScheduleRpcErrorClass =
  | 'rpc_not_found'
  | 'permission_denied'
  | 'unique_violation'
  | 'overlap_violation'
  | 'check_violation'
  | 'invalid_input'
  | 'foreign_key_violation'
  | 'ambiguous_column'
  | 'admin_client_missing'
  | 'empty_result'
  | 'unknown'

export type ClassScheduleRpcErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function buildCreateClassScheduleRpcArgs(input: {
  schedule_date: string
  venue_name: string
  location_details: string | null
  sessions: CreateClassScheduleRpcSession[]
  actorId: string
}): CreateClassScheduleRpcArgs {
  return {
    p_schedule_date: input.schedule_date,
    p_venue_name: input.venue_name,
    p_location_details: input.location_details,
    p_sessions: input.sessions.map((session) => ({
      start_time: session.start_time,
      end_time: session.end_time,
      subject: session.subject,
      note: session.note,
    })),
    p_actor_id: input.actorId,
  }
}

export function createClassScheduleRpcArgKeyCount(
  args: CreateClassScheduleRpcArgs,
): number {
  return CREATE_CLASS_SCHEDULE_RPC_ARG_KEYS.filter((key) => key in args).length
}

export function classifyClassScheduleRpcError(
  error: ClassScheduleRpcErrorLike | null | undefined,
): ClassScheduleRpcErrorClass {
  if (!error) return 'unknown'
  const code = (error.code ?? '').trim()
  const message = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`

  if (
    code === 'PGRST202' ||
    code === 'PGRST203' ||
    /could not find the function|schema cache|no matches were found/i.test(message)
  ) {
    return 'rpc_not_found'
  }
  if (
    code === '42501' ||
    /permission denied|service_role only|admin actor required/i.test(message)
  ) {
    return 'permission_denied'
  }
  if (code === '23505' || /duplicate key|unique/i.test(message)) {
    return 'unique_violation'
  }
  if (code === '23P01' || /overlap/i.test(message)) {
    return 'overlap_violation'
  }
  if (code === '23514' || /check constraint|violates check/i.test(message)) {
    return 'check_violation'
  }
  if (code === '23503' || /foreign key|not found for session/i.test(message)) {
    return 'foreign_key_violation'
  }
  if (code === '42702' || /ambiguous column|ambiguous_column/i.test(message)) {
    return 'ambiguous_column'
  }
  if (
    code === '22023' ||
    code === '22P02' ||
    /invalid venue|invalid address|invalid map_url|invalid room_note|invalid location_details|invalid session|at least one session|sessions must be|too many sessions|actor id is required|subject is required|end_time must be after/i.test(
      message,
    )
  ) {
    return 'invalid_input'
  }
  return 'unknown'
}

export function createClassScheduleRpcDiagnostic(input: {
  phase: 'create_rpc' | 'admin_client' | 'empty_result'
  error?: ClassScheduleRpcErrorLike | null
  argKeyCount?: number
  sessionCount?: number
  errorClass?: ClassScheduleRpcErrorClass
}): Record<string, string | number | boolean | null> {
  const errorClass =
    input.errorClass ??
    (input.phase === 'admin_client'
      ? 'admin_client_missing'
      : input.phase === 'empty_result'
        ? 'empty_result'
        : classifyClassScheduleRpcError(input.error))

  return {
    op: 'class_schedule_create',
    phase: input.phase,
    errorClass,
    supabaseCode: input.error?.code ? String(input.error.code) : null,
    argKeyCount:
      typeof input.argKeyCount === 'number' ? input.argKeyCount : null,
    sessionCount:
      typeof input.sessionCount === 'number' ? input.sessionCount : null,
    hasMessage: Boolean(input.error?.message),
  }
}

/** User-facing copy — keep parity with pre-diagnostic mapping. */
export function mapClassScheduleDbError(error: ClassScheduleRpcErrorLike): string {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === '23505' || /duplicate key|unique/i.test(message)) {
    return '同じ日付の授業予定が既にあります'
  }
  if (code === '23P01' || /overlap/i.test(message)) {
    return '既存のコマと時間が重複しています'
  }
  if (
    code === '22023' ||
    /at least one session|sessions must be|too many sessions/i.test(message)
  ) {
    return /too many/i.test(message)
      ? `コマは1日あたり最大${CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY}件までです`
      : 'コマを1つ以上追加してください'
  }
  if (
    /end_time must be after|invalid session time|subject is required/i.test(
      message,
    )
  ) {
    return 'コマの内容が不正です'
  }
  if (code === '42501' || /permission denied/i.test(message)) {
    return '管理者権限が必要です'
  }
  return '授業予定の保存に失敗しました'
}
