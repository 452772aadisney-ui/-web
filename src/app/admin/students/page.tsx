import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { getPersonName } from '@/lib/auth/display-name'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminStudentsPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const students = await fetchStudentList()

  return (
    <AdminPageShell title="生徒一覧" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">登録生徒</h2>
        <p className="mt-1 text-sm text-muted">
          生徒を選ぶと、学習記録のグラフと詳細を確認できます。
        </p>

        {students.length === 0 ? (
          <p className="mt-6 text-sm text-muted">生徒がまだ登録されていません。</p>
        ) : (
          <ul className="mt-6 divide-y divide-border">
            {students.map((student) => (
              <li key={student.id}>
                <Link
                  href={`/admin/students/${student.id}`}
                  className="flex items-center justify-between gap-4 py-4 transition hover:bg-background -mx-2 px-2 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{getPersonName(student)}</p>
                    <p className="text-xs text-muted">{student.email}</p>
                  </div>
                  <div className="text-right">
                    {student.student_code && (
                      <p className="font-mono text-xs text-muted">{student.student_code}</p>
                    )}
                    <span className="text-sm text-primary">詳細 →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPageShell>
  )
}
