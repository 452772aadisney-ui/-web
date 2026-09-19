import { requireSuperAdminOrRedirect } from '@/lib/auth/admin-access'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { AdminPrivilegeManager } from '@/components/admin/AdminPrivilegeManager'
import { listAdminsForPrivilegeManagement } from '@/app/admin/privileges/actions'

export const dynamic = 'force-dynamic'

export default async function AdminPrivilegesPage() {
  const profile = await requireSuperAdminOrRedirect()
  const admins = await listAdminsForPrivilegeManagement()

  return (
    <StudentPageShell title="管理者権限" backHref="/admin" backLabel="マイページ">
      <p className="mb-4 text-sm text-muted">
        既存の管理者を大管理者へ昇格、または通常管理者へ降格できます。最後の大管理者は降格できません。
        一般生徒を管理者にする機能はありません。
      </p>
      <AdminPrivilegeManager admins={admins} currentUserId={profile.id} />
    </StudentPageShell>
  )
}
