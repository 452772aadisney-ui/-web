import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminCoachingNav } from '@/components/coaching/AdminCoachingNav'
import { AdminCoachingBookings } from '@/components/coaching/AdminCoachingBookings'
import { AdminCoachingProxyBooking } from '@/components/coaching/AdminCoachingProxyBooking'
import { Pagination } from '@/components/ui/Pagination'
import { ScrollToSectionOnParam } from '@/components/ui/ScrollToSectionOnParam'
import { splitUpcomingCoachingBookings } from '@/lib/coaching/admin-bookings-list'
import {
  fetchAvailableCoachingSlots,
  fetchCoachingCoaches,
  fetchPastCoachingBookingsForAdmin,
  fetchUpcomingCoachingBookingsForAdmin,
  PAST_COACHING_BOOKINGS_PAGE_SIZE,
} from '@/lib/coaching/queries'
import { getWeekStartMonday, getWeekdays } from '@/lib/coaching/week'
import { formatPageItemRangeLabel, parsePageParam } from '@/lib/pagination'
import { getJstDateKey } from '@/lib/study/dates'
import { fetchStudentList } from '@/lib/study/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'

export default async function AdminCoachingBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    coach?: string
    start?: string
    student?: string
    pastPage?: string
    pastQ?: string
  }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const todayKey = getJstDateKey()
  // `start` is treated as a date within the target week (normalized to Monday).
  const weekStart = params.start
    ? getWeekStartMonday(params.start)
    : getWeekStartMonday()
  const dateKeys = getWeekdays(weekStart).map((day) => day.date)
  const pastQ = params.pastQ?.trim() ?? ''
  const pastPageRaw = params.pastPage ? parseInt(params.pastPage, 10) : 1

  const [upcomingBookings, pastResult, coaches, allStudents, gradeTagByStudentId] =
    await Promise.all([
      fetchUpcomingCoachingBookingsForAdmin(todayKey),
      fetchPastCoachingBookingsForAdmin({
        todayKey,
        page: Number.isFinite(pastPageRaw) ? pastPageRaw : 1,
        pageSize: PAST_COACHING_BOOKINGS_PAGE_SIZE,
        studentNameQuery: pastQ || undefined,
      }),
      fetchCoachingCoaches(true),
      fetchStudentList(),
      fetchGradeTagNamesByStudentId(),
    ])

  // Keep 既卒 out of proxy candidates; combobox groups the rest (incl. 未設定).
  const students = allStudents.filter(
    (student) => !isKisotsuGradeTag(gradeTagByStudentId.get(student.id)),
  )

  const gradeTagRecord: Record<string, string> = {}
  for (const [id, name] of gradeTagByStudentId) {
    gradeTagRecord[id] = name
  }

  const { todayBookings, futureBookings } = splitUpcomingCoachingBookings(
    upcomingBookings,
    todayKey,
  )

  const pastPage = parsePageParam(String(pastResult.page), pastResult.totalPages)
  const pastRangeLabel = formatPageItemRangeLabel(
    pastPage,
    pastResult.pageSize,
    pastResult.totalCount,
  )

  const selectedCoachId =
    params.coach && coaches.some((coach) => coach.id === params.coach)
      ? params.coach
      : coaches[0]?.id ?? null

  const availableSlots = selectedCoachId
    ? await fetchAvailableCoachingSlots(selectedCoachId, dateKeys)
    : []

  const defaultStudentId =
    params.student && students.some((student) => student.id === params.student)
      ? params.student
      : ''

  const preserveParams = {
    coach: selectedCoachId ?? undefined,
    start: weekStart,
    student: params.student,
    pastQ: pastQ || undefined,
  }

  function buildPastSearchHref(nextQ: string | null) {
    const next = new URLSearchParams()
    if (preserveParams.coach) next.set('coach', preserveParams.coach)
    if (preserveParams.start) next.set('start', preserveParams.start)
    if (preserveParams.student) next.set('student', preserveParams.student)
    if (nextQ) next.set('pastQ', nextQ)
    const qs = next.toString()
    return qs ? `/admin/coaching/bookings?${qs}` : '/admin/coaching/bookings'
  }

  return (
    <AdminPageShell title="予約確認" backHref="/admin/coaching" backLabel="コーチング">
      <AdminCoachingNav />
      <p className="mb-6 text-sm text-muted">
        生徒の代理予約、予約の確認・完了・キャンセルができます。
      </p>

      <AdminCoachingProxyBooking
        coaches={coaches}
        students={students}
        gradeTagByStudentId={gradeTagRecord}
        selectedCoachId={selectedCoachId}
        weekStart={weekStart}
        availableSlots={availableSlots}
        defaultStudentId={defaultStudentId}
      />

      <div className="mt-8">
        <ScrollToSectionOnParam
          sectionId="past-coaching-bookings"
          paramValue={pastPage}
        />
        <AdminCoachingBookings
          todayBookings={todayBookings}
          futureBookings={futureBookings}
          pastBookings={pastResult.bookings}
          pastTotalCount={pastResult.totalCount}
          pastRangeLabel={pastRangeLabel}
          coaches={coaches}
          weekStart={weekStart}
          pastSearchForm={
            <form
              method="get"
              action="/admin/coaching/bookings"
              className="flex flex-wrap items-end gap-2"
              role="search"
            >
              {preserveParams.coach && (
                <input type="hidden" name="coach" value={preserveParams.coach} />
              )}
              {preserveParams.start && (
                <input type="hidden" name="start" value={preserveParams.start} />
              )}
              {preserveParams.student && (
                <input type="hidden" name="student" value={preserveParams.student} />
              )}
              <label className="min-w-[12rem] flex-1">
                <span className="mb-1 block text-sm font-medium">生徒名で検索</span>
                <input
                  type="search"
                  name="pastQ"
                  defaultValue={pastQ}
                  placeholder="例: 山田"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label="過去の予約を生徒名で検索"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                検索
              </button>
              {pastQ && (
                <Link
                  href={buildPastSearchHref(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background"
                >
                  検索を解除
                </Link>
              )}
            </form>
          }
          pastPagination={
            <Pagination
              currentPage={pastPage}
              totalCount={pastResult.totalCount}
              pageSize={pastResult.pageSize}
              pageParam="pastPage"
              pathname="/admin/coaching/bookings"
              preserveParams={preserveParams}
            />
          }
        />
      </div>
    </AdminPageShell>
  )
}
