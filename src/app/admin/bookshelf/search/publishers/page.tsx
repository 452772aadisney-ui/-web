import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { fetchTextbookPublisherOptions } from '@/lib/textbooks/publisher-options'

export default async function AdminBookshelfSearchPublishersPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const publishers = await fetchTextbookPublisherOptions()

  return (
    <AdminPageShell
      title="出版社から探す"
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
      wide
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {publishers.map((publisher) => (
          <li key={publisher}>
            <Link
              href={`/admin/bookshelf/search/results?publisher=${encodeURIComponent(publisher)}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-background"
            >
              {publisher}
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminPageShell>
  )
}
