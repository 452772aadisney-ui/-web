import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TEXTBOOK_TARGET_UNIVERSITIES } from '@/lib/constants/textbook-search'

export default async function TextbookSearchUniversitiesPage() {
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  return (
    <StudentPageShell
      title="大学別に探す"
      backHref="/dashboard/textbooks/search"
      backLabel="検索メニュー"
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {TEXTBOOK_TARGET_UNIVERSITIES.map((university) => (
          <li key={university}>
            <Link
              href={`/dashboard/textbooks/search/results?university=${encodeURIComponent(university)}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-background"
            >
              {university}
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </StudentPageShell>
  )
}
