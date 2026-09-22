import Link from 'next/link'
import { requireSuperAdminOrRedirect } from '@/lib/class-schedule/access'
import { listKisotsuStudentsForCourseAdmin } from '@/app/class-course/actions'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminNarrowContent } from '@/components/layout/AdminNarrowContent'

export const dynamic = 'force-dynamic'

export default async function AdminClassCourseStudentsIndexPage() {
  await requireSuperAdminOrRedirect()
  const students = await listKisotsuStudentsForCourseAdmin()

  return (
    <AdminPageShell
      title="生徒別 実施・残回数"
      backHref="/admin/class-schedule"
      backLabel="授業予定"
    >
      <AdminNarrowContent>
        <p className="mb-6 text-sm text-muted">
          生徒を選び、共通授業の実施状況と残回数を確認します。授業回数の新規登録は「授業回数登録」から行います。
        </p>
        {students.length === 0 ? (
          <p className="text-sm text-muted">表示できる既卒生がいません。</p>
        ) : (
          <ul className="space-y-2 text-sm">
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
        )}
        <p className="mt-8 text-sm">
          <Link href="/admin/class-schedule/courses" className="text-primary underline">
            授業回数登録へ
          </Link>
        </p>
      </AdminNarrowContent>
    </AdminPageShell>
  )
}
