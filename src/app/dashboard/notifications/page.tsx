import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { NotificationSettingsClient } from '@/components/notifications/NotificationSettingsClient'
import { getNotificationPreferences } from '@/app/notifications/actions'
import { defaultNotificationPreferences } from '@/lib/push/preferences'

export const dynamic = 'force-dynamic'

export default async function StudentNotificationsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect('/admin')

  const prefsResult = await getNotificationPreferences()
  const initialPreferences = prefsResult.ok
    ? prefsResult.preferences
    : defaultNotificationPreferences()
  const initialPrefsFromDatabase = prefsResult.ok ? prefsResult.fromDatabase : false
  const initialPrefsError = !prefsResult.ok

  return (
    <StudentPageShell title="通知設定" backHref="/dashboard" backLabel="マイページ">
      <NotificationSettingsClient
        initialPreferences={initialPreferences}
        initialPrefsFromDatabase={initialPrefsFromDatabase}
        initialPrefsError={initialPrefsError}
      />
    </StudentPageShell>
  )
}
