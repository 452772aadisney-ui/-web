import { createAdminClient } from '@/lib/supabase/admin'
import { formatCoachingBookingDateTime } from '@/lib/coaching/format'
import { resolveEffectiveCoachingReminderMode } from '@/lib/coaching/coaching-reminder-mode'
import { processCoachingReminderNewPath } from '@/lib/coaching/coaching-reminder-new-path'
import {
  ADMIN_RESCHEDULE_PUSH_BODY,
  adminRescheduleIdempotencyKey,
} from '@/lib/coaching/coaching-reminder-email'

export type AdminRescheduleNotifyResult = 'sent' | 'skipped' | 'failed'

/**
 * Push-first / email-fallback student notify after an admin reschedule.
 * Honors coaching_reminder prefs and COACHING_REMINDER_DELIVERY_MODE.
 *
 * Idempotency uses the persisted change revision (`booked_at` written on that
 * successful DB update) — not a request UUID and not a before/after time pair.
 */
export async function notifyStudentOfAdminCoachingReschedule(params: {
  studentId: string
  coachName: string
  startsAt: string
  endsAt: string
  slotDate: string | null
  startTime: string | null
  bookingId: string
  /** `booked_at` returned from the successful reschedule update. */
  changeRevision: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AdminRescheduleNotifyResult> {
  const env = params.env ?? process.env
  const effective = resolveEffectiveCoachingReminderMode(env)

  if (effective.mode === 'legacy' || effective.mode === 'dry-run') {
    return 'skipped'
  }

  const useNewPath =
    effective.mode === 'all' ||
    (effective.mode === 'allowlist' &&
      effective.allowlist != null &&
      effective.allowlist.has(params.studentId.toLowerCase()))

  if (!useNewPath) return 'skipped'

  const admin = createAdminClient()
  if (!admin) return 'failed'

  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', params.studentId)
    .maybeSingle<{ email: string | null }>()

  const datetimeLabel = formatCoachingBookingDateTime(
    params.slotDate,
    params.startTime,
    params.startsAt,
    params.endsAt,
  )

  const idempotencyKey = adminRescheduleIdempotencyKey(
    params.bookingId,
    params.changeRevision,
  )

  const outcome = await processCoachingReminderNewPath({
    studentUserId: params.studentId,
    email: profile?.email ?? null,
    idempotencyKey,
    kind: 'admin_reschedule',
    pushBody: ADMIN_RESCHEDULE_PUSH_BODY,
    coachName: params.coachName,
    datetimeLabel,
    tag: `coaching-admin-reschedule-${params.bookingId}`,
    eventMetadata: { source: 'admin_reschedule' },
    env,
  })

  if (
    outcome === 'push_sent' ||
    outcome === 'email_sent' ||
    outcome === 'already_completed'
  ) {
    return 'sent'
  }

  if (
    outcome === 'preference_disabled' ||
    outcome === 'non_production_skip' ||
    outcome === 'undeliverable'
  ) {
    return 'skipped'
  }

  return 'failed'
}
