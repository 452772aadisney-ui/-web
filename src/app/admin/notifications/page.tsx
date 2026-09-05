import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminNotificationOpsClient } from '@/components/admin/AdminNotificationOpsClient'
import { AdminNotificationTestClient } from '@/components/admin/AdminNotificationTestClient'
import { AdminCoachingBookingReminderPanel } from '@/components/chat/AdminCoachingBookingReminderPanel'
import { listAdminNotificationTestTargets } from '@/lib/admin/notification-test-service'
import {
  isAdminNotificationTestEnabled,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'
import { loadNotificationOpsSnapshot } from '@/lib/admin/notification-ops-snapshot'
import { fetchStudentsWithoutCoachingBookingThisWeek } from '@/lib/coaching/queries'
import { formatWeekRange, getWeekStartMonday } from '@/lib/coaching/week'

export const dynamic = 'force-dynamic'

const COACHING_BOOKING_REMINDER_MESSAGE =
  '今週のコーチング予約が入っていません。マイページの「コーチング予約」から，早急に予約してください。今週が難しい場合は，必ず担当者に個別で相談してください。'

export default async function AdminNotificationsOpsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const availability = resolveAdminNotificationTestAvailability()
  const [listed, ops, unbookedStudents] = await Promise.all([
    listAdminNotificationTestTargets(),
    loadNotificationOpsSnapshot(),
    fetchStudentsWithoutCoachingBookingThisWeek(),
  ])

  const featureAvailable = listed.ok && listed.featureAvailable
  const disabledReason = !listed.ok
    ? 'admin_unavailable'
    : listed.featureAvailable
      ? null
      : listed.reason
  const targets = listed.ok && listed.featureAvailable ? listed.targets : []
  const weekLabel = formatWeekRange(getWeekStartMonday())

  return (
    <AdminPageShell title="通知運用" backHref="/admin" backLabel="管理画面">
      <AdminNarrowContent size="comfortable">
        <p className="mb-6 text-sm text-muted">
          通知基盤の状態確認、dry-run、許可されたテストアカウントへの固定文面テストを行います。
          一般生徒の個人履歴は表示しません。この画面から mode 変更・Cron 実行はできません。
          {!availability.available && availability.reason === 'flag_off'
            ? ' 機能フラグがOFFのため、外部送信はできません。'
            : null}
        </p>

        <div className="space-y-10">
          <AdminNotificationOpsClient
            initialSnapshot={ops.ok ? ops.snapshot : null}
            initialLoadError={!ops.ok}
          />
          <AdminNotificationTestClient
            initialFeatureAvailable={Boolean(featureAvailable)}
            initialFlagEnabled={isAdminNotificationTestEnabled()}
            initialDisabledReason={disabledReason}
            initialTargets={targets}
          />

          <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <summary className="cursor-pointer list-none text-base font-bold marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                緊急時の手動操作
                <span className="text-sm font-normal text-muted">
                  （チャット一括送信・対象 {unbookedStudents.length} 名）
                </span>
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted">
                ここから送るのは <strong>チャットメッセージの一括送信</strong> です。Web Push
                の予約催促 Cron（Push-first）とは別経路です。展開しただけでは送信されません。
              </p>
              <AdminCoachingBookingReminderPanel
                weekLabel={weekLabel}
                targetCount={unbookedStudents.length}
                defaultMessage={COACHING_BOOKING_REMINDER_MESSAGE}
              />
            </div>
          </details>
        </div>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
