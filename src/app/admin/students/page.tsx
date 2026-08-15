import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { formatLastSignInAt, fetchStudentLastSignInMap } from '@/lib/auth/last-sign-in'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { getPersonName } from '@/lib/auth/display-name'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminStudentsPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const [students, gradeTagByStudentId, lastSignInByStudentId] = await Promise.all([
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
    fetchStudentLastSignInMap(),
  ])

  const studentsWithLastSignIn = students.map((student) => ({
    ...student,
    last_sign_in_at: lastSignInByStudentId.get(student.id) ?? null,
  }))

  const studentGroups = groupStudentsByGrade(studentsWithLastSignIn, gradeTagByStudentId)

  return (
    <AdminPageShell title="生徒一覧" backHref="/admin" backLabel="管理画面">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">登録生徒</h2>
        <p className="mt-1 text-sm text-muted">
          学年ごとに表示しています。生徒を選ぶと、学習記録のグラフと詳細を確認できます。
        </p>

        {studentsWithLastSignIn.length === 0 ? (
          <p className="mt-6 text-sm text-muted">生徒がまだ登録されていません。</p>
        ) : (
          <div className="mt-6 space-y-8">
            {studentGroups.map((group) => (
              <div key={group.gradeLabel}>
                <h3 className="mb-3 text-sm font-bold text-muted">{group.gradeLabel}</h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {group.students.map((student) => (
                    <li key={student.id}>
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="-mx-px flex items-center justify-between gap-4 rounded-xl px-4 py-4 transition hover:bg-background"
                      >
                        <div>
                          <p className="font-medium">{getPersonName(student)}</p>
                          <p className="text-xs text-muted">{student.email}</p>
                          <p className="mt-1 text-xs text-muted">
                            最終ログイン: {formatLastSignInAt(student.last_sign_in_at)}
                          </p>
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
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  )
}
