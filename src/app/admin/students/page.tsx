import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { fetchStudentLastAccessMap } from '@/lib/auth/last-access'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudentsList } from '@/components/admin/AdminStudentsList'
import { Pagination } from '@/components/ui/Pagination'
import { GRADE_TAG_NAMES, groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchStudentsPaginated } from '@/lib/study/queries'
import Link from 'next/link'

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grade?: string; studentsPage?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const params = await searchParams
  const pageNumber = params.studentsPage ? parseInt(params.studentsPage, 10) : 1
  const query = params.q?.trim() ?? ''
  const grade = params.grade?.trim() ?? ''

  const [pageResult, lastAccessByStudentId] = await Promise.all([
    fetchStudentsPaginated({
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 30,
      query,
      grade: grade || undefined,
    }),
    fetchStudentLastAccessMap(),
  ])

  const gradeTagByStudentId = await fetchGradeTagNamesByStudentId()

  const studentsWithLastAccess = pageResult.students.map((student) => ({
    ...student,
    last_accessed_at: lastAccessByStudentId.get(student.id) ?? null,
  }))

  const studentGroups = groupStudentsByGrade(studentsWithLastAccess, gradeTagByStudentId)

  function buildFilterHref(next: { q?: string; grade?: string | null }) {
    const nextParams = new URLSearchParams()
    const nextQ = Object.prototype.hasOwnProperty.call(next, 'q') ? (next.q ?? '') : query
    const nextGrade = Object.prototype.hasOwnProperty.call(next, 'grade')
      ? (next.grade ?? '')
      : grade
    if (nextQ) nextParams.set('q', nextQ)
    if (nextGrade) nextParams.set('grade', nextGrade)
    const qs = nextParams.toString()
    return qs ? `/admin/students?${qs}` : '/admin/students'
  }

  return (
    <AdminPageShell title="生徒一覧" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">登録生徒</h2>
        <p className="mt-1 text-sm text-muted">
          学年ごとに表示しています。見出しを押すと表示・非表示を切り替えられます。
        </p>

        <form action="/admin/students" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="氏名・生徒ID・メールで検索"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {grade && <input type="hidden" name="grade" value={grade} />}
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            検索
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={buildFilterHref({ grade: null })}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              !grade ? 'bg-primary text-white' : 'border border-border hover:bg-background'
            }`}
          >
            すべて
          </Link>
          {GRADE_TAG_NAMES.map((gradeName) => (
            <Link
              key={gradeName}
              href={buildFilterHref({ grade: gradeName })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                grade === gradeName
                  ? 'bg-primary text-white'
                  : 'border border-border hover:bg-background'
              }`}
            >
              {gradeName}
            </Link>
          ))}
        </div>

        {pageResult.totalCount === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {query || grade
              ? '条件に一致する生徒が見つかりませんでした。'
              : '生徒がまだ登録されていません。'}
          </p>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted">
              {pageResult.totalCount} 名中 {studentsWithLastAccess.length} 名を表示
              {query || grade ? '（絞り込み中）' : ''}
            </p>
            <AdminStudentsList groups={studentGroups} />
            <Pagination
              currentPage={pageResult.page}
              totalCount={pageResult.totalCount}
              pageSize={pageResult.pageSize}
              pageParam="studentsPage"
              pathname="/admin/students"
              preserveParams={{
                q: query || undefined,
                grade: grade || undefined,
              }}
            />
          </>
        )}
      </section>
    </AdminPageShell>
  )
}
