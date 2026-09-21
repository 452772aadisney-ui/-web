import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/class-schedule/access'
import type { Profile } from '@/types/database'

/** DB create RPC と同じ上限（053 create_class_schedule_day_with_sessions）。 */
export const CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY = 24

export type ClassScheduleAdminRpcClient = {
  ok: true
  profile: Profile
  admin: NonNullable<ReturnType<typeof createAdminClient>>
}

/**
 * Write RPCs are service_role-only. Call only after this helper:
 * 1) getUser + profiles.is_super_admin via requireSuperAdmin
 * 2) Admin Client (service role) — never user-scoped anon client
 */
export async function requireAdminClassScheduleRpcClient(): Promise<
  ClassScheduleAdminRpcClient | { ok: false; error: string }
> {
  const access = await requireSuperAdmin()
  if (!access.ok) return { ok: false, error: access.error }

  const admin = createAdminClient()
  if (!admin) {
    console.error('[class-schedule] create failed:', {
      op: 'class_schedule_create',
      phase: 'admin_client',
      errorClass: 'admin_client_missing',
      supabaseCode: null,
      argKeyCount: null,
      sessionCount: null,
      hasMessage: false,
    })
    return { ok: false, error: '授業予定の保存に失敗しました' }
  }

  return { ok: true, profile: access.profile, admin }
}

export function isWithinSessionLimit(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= 1 &&
    count <= CLASS_SCHEDULE_MAX_SESSIONS_PER_DAY
  )
}

/** Signatures used in verify SQL — keep in sync with 057/065/069. */
export const CLASS_SCHEDULE_WRITE_RPC_SIGNATURES = {
  create:
    'public.create_class_schedule_day_with_course_sessions(date,text,text,jsonb,uuid)',
  createLegacy:
    'public.create_class_schedule_day_with_sessions(date,text,text,jsonb,uuid)',
  bump: 'public.bump_class_schedule_notify_revision(uuid,uuid)',
  isKisotsu: 'public.is_kisotsu_profile()',
} as const
