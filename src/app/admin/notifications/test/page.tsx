import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminNotificationTestClient } from '@/components/admin/AdminNotificationTestClient'
import { listAdminNotificationTestTargets } from '@/lib/admin/notification-test-service'
import { resolveAdminNotificationTestAvailability } from '@/lib/admin/notification-test-config'

export const dynamic = 'force-dynamic'

export default async function AdminNotificationTestPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const availability = resolveAdminNotificationTestAvailability()
  const listed = await listAdminNotificationTestTargets()

  const featureAvailable = listed.ok && listed.featureAvailable
  const disabledReason = !listed.ok
    ? 'admin_unavailable'
    : listed.featureAvailable
      ? null
      : listed.reason
  const targets = listed.ok && listed.featureAvailable ? listed.targets : []

  return (
    <AdminPageShell title="通知テスト" backHref="/admin" backLabel="管理画面">
      <AdminNarrowContent size="comfortable">
        <p className="mb-6 text-sm text-muted">
          許可されたテストアカウント向けに、学習記録リマインダー相当の通知経路を任意タイミングで確認します。通常の22:00
          Cron とは履歴が分離されます。
          {!availability.available && availability.reason === 'flag_off'
            ? ' 機能フラグがOFFのため、外部送信はできません。'
            : null}
        </p>
        <AdminNotificationTestClient
          initialFeatureAvailable={Boolean(featureAvailable)}
          initialDisabledReason={disabledReason}
          initialTargets={targets}
        />
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
