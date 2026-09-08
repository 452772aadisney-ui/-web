import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { fetchStudentLastAccessMap } from '@/lib/auth/last-access'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudentsList } from '@/components/admin/AdminStudentsList'
import { Pagination } from '@/components/ui/Pagination'
import { GRADE_TAG_NAMES, groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import {
  parsePushRegistrationFilter,
  type PushRegistrationView,
} from '@/lib/admin/push-registration'
import { fetchAdminStudentsWithPushRegistration } from '@/lib/admin/push-registration-queries'
import Link from 'next/link'

const PUSH_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'registered', label: 'Push登録済み' },
  { value: 'unregistered', label: 'Push未登録' },
] as const

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    grade?: string
    studentsPage?: string
    push?: string
  }>
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
  const pushFilter = parsePushRegistrationFilter(params.push)

  const [pageResult, lastAccessByStudentId] = await Promise.all([
    fetchAdminStudentsWithPushRegistration({
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 30,
      query,
      grade: grade || undefined,
      push: pushFilter,
    }),
    fetchStudentLastAccessMap(),
  ])

  const gradeTagByStudentId = await fetchGradeTagNamesByStudentId()

  const studentsWithLastAccess = pageResult.students.map((student) => ({
    ...student,
    last_accessed_at: lastAccessByStudentId.get(student.id) ?? null,
  }))

  const studentGroups = groupStudentsByGrade(studentsWithLastAccess, gradeTagByStudentId)

  const registrationByStudentId: Record<string, PushRegistrationView> = {}
  for (const [id, view] of pageResult.registrationByStudentId) {
    registrationByStudentId[id] = view
  }

  function buildFilterHref(next: {
    q?: string
    grade?: string | null
    push?: string | null
  }) {
    const nextParams = new URLSearchParams()
    const nextQ = Object.prototype.hasOwnProperty.call(next, 'q') ? (next.q ?? '') : query
    const nextGrade = Object.prototype.hasOwnProperty.call(next, 'grade')
      ? (next.grade ?? '')
      : grade
    const nextPush = Object.prototype.hasOwnProperty.call(next, 'push')
      ? (next.push ?? 'all')
      : pushFilter

    if (nextQ) nextParams.set('q', nextQ)
    if (nextGrade) nextParams.set('grade', nextGrade)
    if (nextPush && nextPush !== 'all') nextParams.set('push', nextPush)
    // studentsPage intentionally omitted → page 1
    const qs = nextParams.toString()
    return qs ? `/admin/students?${qs}` : '/admin/students'
  }

  const hasFilters = Boolean(query || grade || pushFilter !== 'all')

  return (
    <AdminPageShell title="生徒一覧" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">登録生徒</h2>
        <p className="mt-1 text-sm text-muted">
          学年ごとに表示しています。見出しを押すと表示・非表示を切り替えられます。
        </p>
        <p className="mt-2 text-xs text-muted">
          Push登録済みは受験生webに登録されている有効なPush購読です。端末やOS側の設定変更は即時反映されない場合があります。
        </p>

        <form action="/admin/students" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="氏名・氏名かな・生徒ID・メールで検索"
            aria-label="生徒を検索"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {grade && <input type="hidden" name="grade" value={grade} />}
          {pushFilter !== 'all' && <input type="hidden" name="push" value={pushFilter} />}
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
          >
            検索
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="学年で絞り込み">
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

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Push登録状態で絞り込み">
          {PUSH_FILTER_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildFilterHref({
                push: option.value === 'all' ? null : option.value,
              })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                pushFilter === option.value
                  ? 'bg-primary text-white'
                  : 'border border-border hover:bg-background'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {pageResult.registrationLookupFailed && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            Push登録状況を確認できませんでした。一覧の生徒表示は続けますが、バッジは「確認不能」になります。
          </p>
        )}

        {pageResult.totalCount === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {hasFilters
              ? '条件に一致する生徒が見つかりませんでした。'
              : '生徒がまだ登録されていません。'}
          </p>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted">
              {pageResult.totalCount} 名中 {studentsWithLastAccess.length} 名を表示
              {hasFilters ? '（絞り込み中）' : ''}
            </p>
            <AdminStudentsList
              groups={studentGroups}
              registrationByStudentId={registrationByStudentId}
            />
            <Pagination
              currentPage={pageResult.page}
              totalCount={pageResult.totalCount}
              pageSize={pageResult.pageSize}
              pageParam="studentsPage"
              pathname="/admin/students"
              preserveParams={{
                q: query || undefined,
                grade: grade || undefined,
                push: pushFilter === 'all' ? undefined : pushFilter,
              }}
            />
          </>
        )}
      </section>
    </AdminPageShell>
  )
}
