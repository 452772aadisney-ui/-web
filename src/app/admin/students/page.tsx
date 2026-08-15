import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { fetchStudentLastSignInMap } from '@/lib/auth/last-sign-in'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudentsList } from '@/components/admin/AdminStudentsList'
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
          学年ごとに表示しています。見出しを押すと表示・非表示を切り替えられます。
        </p>

        {studentsWithLastSignIn.length === 0 ? (
          <p className="mt-6 text-sm text-muted">生徒がまだ登録されていません。</p>
        ) : (
          <AdminStudentsList groups={studentGroups} />
        )}
      </section>
    </AdminPageShell>
  )
}
