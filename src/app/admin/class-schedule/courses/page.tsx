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
          生徒別の残回数・履歴は{' '}
          <Link href="/admin/students" className="text-primary underline">
            生徒一覧
          </Link>
          から各生徒ページ（
          <code className="text-xs">/admin/class-schedule/students/[id]</code>
          ）で確認できます。
        </p>
        <AdminClassCourseRegistrationPanels
          defaultAcademicYear={academicYear}
          students={students}
        />
        <p className="mt-8 text-sm">
          <Link href="/admin/class-schedule" className="text-primary underline">
            授業予定一覧へ戻る
          </Link>
        </p>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
