import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminNotificationOpsClient } from '@/components/admin/AdminNotificationOpsClient'
import { AdminNotificationTestClient } from '@/components/admin/AdminNotificationTestClient'
import { listAdminNotificationTestTargets } from '@/lib/admin/notification-test-service'
import {
  isAdminNotificationTestEnabled,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'
import { loadNotificationOpsSnapshot } from '@/lib/admin/notification-ops-snapshot'

export const dynamic = 'force-dynamic'

export default async function AdminNotificationsOpsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const availability = resolveAdminNotificationTestAvailability()
  const listed = await listAdminNotificationTestTargets()
  const ops = await loadNotificationOpsSnapshot()

  const featureAvailable = listed.ok && listed.featureAvailable
  const disabledReason = !listed.ok
    ? 'admin_unavailable'
    : listed.featureAvailable
      ? null
      : listed.reason
  const targets = listed.ok && listed.featureAvailable ? listed.targets : []

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
        </div>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
