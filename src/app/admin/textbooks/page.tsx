import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/get-profile'

import { getDashboardPathForRole } from '@/lib/auth/routes'

import { AdminPageShell } from '@/components/layout/AdminPageShell'

import { AdminTextbookSchedule } from '@/components/schedule/AdminTextbookSchedule'

import { fetchStudentList, fetchTextbooksForStudent } from '@/lib/study/queries'



export default async function AdminTextbooksPage() {

  const profile = await getCurrentProfile()



  if (!profile) redirect('/login')

  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))



  const students = await fetchStudentList()



  const textbooksByStudent: Record<string, Awaited<ReturnType<typeof fetchTextbooksForStudent>>> = {}

  await Promise.all(

    students.map(async (s) => {

      textbooksByStudent[s.id] = await fetchTextbooksForStudent(s.id)

    }),

  )



  return (

    <AdminPageShell title="参考書登録" backHref="/admin" backLabel="管理画面">

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">

        <h2 className="mb-1 text-lg font-bold">参考書スケジュール（生徒別）</h2>

        <p className="mb-6 text-sm text-muted">

          各生徒の参考書と開始日・終了予定日を登録します。カレンダーに自動反映されます。

        </p>

        <AdminTextbookSchedule

          students={students.map((s) => ({

            id: s.id,

            full_name: s.full_name,

            display_name: s.display_name,

            subjects: (s as { subjects?: string[] }).subjects ?? [],

          }))}

          textbooksByStudent={textbooksByStudent}

        />

      </section>

    </AdminPageShell>

  )

}

