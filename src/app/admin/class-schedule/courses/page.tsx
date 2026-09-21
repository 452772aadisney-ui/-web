import Link from 'next/link'
import { requireSuperAdminOrRedirect } from '@/lib/class-schedule/access'
import { resolveAcademicYearFromJstDateKey } from '@/lib/class-course/catalog'
import { getJstDateKey } from '@/lib/study/dates'
import { listKisotsuStudentsForCourseAdmin } from '@/app/class-course/actions'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'
import { AdminClassCourseRegistrationPanels } from '@/components/class-course/AdminClassCourseRegistrationPanels'

export const dynamic = 'force-dynamic'

export default async function AdminClassCourseRegistrationPage() {
  await requireSuperAdminOrRedirect()
  const academicYear = resolveAcademicYearFromJstDateKey(getJstDateKey())
  const students = await listKisotsuStudentsForCourseAdmin()

  return (
    <AdminPageShell
      title="授業回数登録"
      backHref="/admin/class-schedule"
      backLabel="授業予定"
    >
      <AdminNarrowContent>
        <p className="mb-6 text-sm text-muted">
          共通授業の登録と生徒への割り当てを行います。予定コマへの日時設定は授業予定画面から行います。
        </p>
        <AdminClassCourseRegistrationPanels
          defaultAcademicYear={academicYear}
          students={students}
        />
        <section className="mt-10 space-y-2">
          <h2 className="text-base font-bold">生徒別 残回数・履歴</h2>
          <ul className="space-y-1 text-sm">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/class-schedule/students/${s.id}`}
                  className="text-primary underline"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
