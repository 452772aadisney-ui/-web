import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { getPersonName } from '@/lib/auth/display-name'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { CoachingKarteHistoryEntry } from '@/components/coaching/CoachingKarteHistoryEntry'
import { CoachingKarteMigrationNotice } from '@/components/coaching/CoachingKarteMigrationNotice'
import { Pagination } from '@/components/ui/Pagination'
import { fetchCoachingCoaches } from '@/lib/coaching/queries'
import { fetchCoachingKarteEntriesForStudent } from '@/lib/coaching/karte-queries'
import { KARTE_HISTORY_PAGE_SIZE } from '@/lib/coaching/karte-constants'
import { fetchStudentProfile } from '@/lib/study/queries'

export default async function AdminCoachingKarteHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const { studentId } = await params
  const query = await searchParams
  const rawPage = parseInt(query.page ?? '1', 10)
  const pageNumber = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

  const [student, karteResult, coaches] = await Promise.all([
    fetchStudentProfile(studentId),
    fetchCoachingKarteEntriesForStudent(studentId, {
      page: pageNumber,
      pageSize: KARTE_HISTORY_PAGE_SIZE,
    }),
    fetchCoachingCoaches(true),
  ])

  if (!student || student.role !== 'student') {
    notFound()
  }

  const personName = getPersonName(student)
  const karteHref = `/admin/coaching/karte/${studentId}`

  return (
    <AdminPageShell
      title={`${personName} のカルテ記録`}
      backHref={karteHref}
      backLabel="カルテに戻る"
    >
      <AdminCoachingNav />

      {!karteResult.tableAvailable && <CoachingKarteMigrationNotice />}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">すべての記録</h2>
            <p className="mt-1 text-sm text-muted">{personName}</p>
          </div>
          <Link href={karteHref} className="text-sm text-primary hover:underline">
            ← カルテに戻る
          </Link>
        </div>

        {karteResult.totalCount === 0 ? (
          <p className="mt-4 text-sm text-muted">まだカルテの記録がありません。</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {karteResult.entries.map((entry) => (
                <CoachingKarteHistoryEntry
                  key={entry.id}
                  entry={entry}
                  coaches={coaches}
                  tableAvailable={karteResult.tableAvailable}
                />
              ))}
            </ul>
            <Pagination
              currentPage={karteResult.page ?? 1}
              totalCount={karteResult.totalCount ?? 0}
              pageSize={karteResult.pageSize ?? KARTE_HISTORY_PAGE_SIZE}
              pathname={`/admin/coaching/karte/${studentId}/history`}
            />
          </>
        )}
      </section>
    </AdminPageShell>
  )
}
