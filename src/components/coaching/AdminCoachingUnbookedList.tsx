import Link from 'next/link'
import { getPersonName } from '@/lib/auth/display-name'
import { formatWeekRange, getWeekStartMonday } from '@/lib/coaching/week'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'

interface AdminCoachingUnbookedListProps {
  students: Array<{
    id: string
    full_name: string
    display_name: string
    email: string
    student_code: string | null
  }>
}

export async function AdminCoachingUnbookedList({ students }: AdminCoachingUnbookedListProps) {
  const gradeTagByStudentId = await fetchGradeTagNamesByStudentId()
  const groups = groupStudentsByGrade(students, gradeTagByStudentId)
  const weekLabel = formatWeekRange(getWeekStartMonday())

  return (
    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
      <h2 className="text-lg font-bold">今週（{weekLabel}）未予約の生徒</h2>
      <p className="mt-1 text-sm text-muted">
        月〜日の間に scheduled のコーチング予約がない生徒です（既卒除く）。
      </p>

      {students.length === 0 ? (
        <p className="mt-4 text-sm text-muted">今週未予約の生徒はいません。</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.gradeLabel}>
              <p className="text-sm font-bold">{group.gradeLabel}</p>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                {group.students.map((student) => (
                  <li key={student.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{getPersonName(student)}</p>
                      {student.student_code && (
                        <p className="text-xs text-muted">生徒番号: {student.student_code}</p>
                      )}
                    </div>
                    <Link
                      href={`/admin/coaching/bookings?student=${student.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      代理予約 →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-center text-sm">
        <Link href="/admin/coaching/bookings" className="text-primary hover:underline">
          予約確認・代理予約ページへ
        </Link>
      </p>
    </section>
  )
}
