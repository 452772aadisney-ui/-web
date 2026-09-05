import { redirect } from 'next/navigation'

/** Legacy path — ops dashboard lives at /admin/notifications. */
export default function AdminNotificationTestRedirectPage() {
  redirect('/admin/notifications')
}
