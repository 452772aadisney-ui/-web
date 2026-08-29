import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { TEXTBOOK_TARGET_UNIVERSITIES } from '@/lib/constants/textbook-search'

export default async function AdminBookshelfSearchUniversitiesPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  return (
    <AdminPageShell
      title="大学別に探す"
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
      wide
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {TEXTBOOK_TARGET_UNIVERSITIES.map((university) => (
          <li key={university}>
            <Link
              href={`/admin/bookshelf/search/results?university=${encodeURIComponent(university)}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-background"
            >
              {university}
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminPageShell>
  )
}
