import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { getPersonName } from '@/lib/auth/display-name'
import { fetchUnreadChatCount } from '@/lib/chat/unread-count'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminMyPageActions } from '@/components/admin/AdminMyPageActions'
import { getJstDateKey } from '@/lib/study/dates'
import { fetchIncompleteStudyFeedbackCount } from '@/lib/study/feedback-queries'

export default async function AdminDashboardPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const personName = getPersonName(profile)
  const [unreadChatCount, incompleteStudyFeedbackCount] = await Promise.all([
    fetchUnreadChatCount(profile.id),
    fetchIncompleteStudyFeedbackCount(getJstDateKey()),
  ])

  return (
    <AdminPageShell title="マイページ" showMainNav={false}>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted">管理者としてログイン中</p>
          <h2 className="mt-1 text-2xl font-bold">{personName} さん</h2>
          <p className="mt-2 text-muted">{profile.email}</p>
          <span className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
            管理者
          </span>
        </section>

        <AdminMyPageActions
          unreadChatCount={unreadChatCount}
          incompleteStudyFeedbackCount={incompleteStudyFeedbackCount}
        />
      </div>
    </AdminPageShell>
  )
}
