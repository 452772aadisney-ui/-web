import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { getDashboardPathForRole } from '@/lib/auth/routes'

export default async function AdminProfilePage() {
  const profile = await requireProfile()

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  return (
    <AdminPageShell title="プロフィール編集" backHref="/admin" backLabel="管理画面">
      <AdminNarrowContent size="narrow">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">基本情報</h2>
          <p className="mb-6 text-sm text-muted">{profile.email}</p>
          <ProfileForm profile={profile} backHref="/admin" />
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
