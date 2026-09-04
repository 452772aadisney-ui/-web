import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudyLogTextbookForm } from '@/components/study/StudyLogTextbookForm'
import { StudyTextbookPicker } from '@/components/study/StudyTextbookPicker'
import { deriveStudyCategoryFromTextbook } from '@/lib/constants/textbook-subject-categories'
import { toStudyTextbookPickerItems } from '@/lib/study/textbook-picker'
import {
  fetchTextbookForStudent,
  fetchTextbooksForStudent,
  fetchTextbookStudyUsageForStudent,
} from '@/lib/study/queries'

export default async function StudentStudyTextbookPage({
  searchParams,
}: {
  searchParams: Promise<{ textbookId?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const params = await searchParams
  const requestedTextbookId = params.textbookId?.trim() || null
  const profileSubjects = profile.subjects ?? []

  if (requestedTextbookId) {
    const textbook = await fetchTextbookForStudent(profile.id, requestedTextbookId)
    if (!textbook) {
      redirect('/dashboard/study/textbook')
    }

    const subject = deriveStudyCategoryFromTextbook(
      textbook.subjects ?? [],
      profileSubjects,
      textbook.detail_tags ?? [],
    )

    if (!subject) {
      return (
        <StudentPageShell
          title="参考書で登録"
          backHref="/dashboard/study/textbook"
          backLabel="参考書を選ぶ"
        >
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-medium">この参考書の科目を判定できませんでした。</p>
            <p className="mt-2">
              プロフィールの使用科目と参考書の科目設定を確認するか、別の参考書を選んでください。
            </p>
            <Link
              href="/dashboard/study/textbook"
              className="mt-4 inline-flex font-medium text-primary underline"
            >
              参考書を選び直す
            </Link>
          </section>
        </StudentPageShell>
      )
    }

    return (
      <StudentPageShell
        title="参考書で登録"
        backHref="/dashboard/study/textbook"
        backLabel="参考書を選ぶ"
      >
        <div className="space-y-6">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">学習を記録</h2>
            <div className="mt-6">
              <StudyLogTextbookForm
                textbookId={textbook.id}
                textbookName={textbook.name}
                subject={subject}
              />
            </div>
          </section>
          <p className="text-center text-sm text-muted">
            <Link href="/dashboard/study/history" className="text-primary hover:underline">
              学習履歴
            </Link>
          </p>
        </div>
      </StudentPageShell>
    )
  }

  const [textbooks, usage] = await Promise.all([
    fetchTextbooksForStudent(profile.id),
    fetchTextbookStudyUsageForStudent(profile.id, 4).catch(() => ({
      lastStudiedOnByTextbookId: {},
      recentTextbookIds: [] as string[],
    })),
  ])

  const pickerItems = toStudyTextbookPickerItems(
    textbooks,
    profileSubjects,
    usage.lastStudiedOnByTextbookId,
  )
  const textbookById = new Map(pickerItems.map((book) => [book.id, book]))
  const recentTextbooks = usage.recentTextbookIds
    .map((id) => textbookById.get(id))
    .filter((book): book is NonNullable<typeof book> => book != null)

  return (
    <StudentPageShell title="参考書で登録" backHref="/dashboard" backLabel="マイページ">
      <div className="space-y-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">参考書を選ぶ</h2>
          <p className="mt-1 text-sm text-muted">
            登録済みの参考書から選ぶと、科目付きで学習記録できます。
          </p>
          <div className="mt-6">
            <StudyTextbookPicker
              profileSubjects={profileSubjects}
              textbooks={pickerItems}
              recentTextbooks={recentTextbooks}
            />
          </div>
        </section>

        <p className="text-center text-sm text-muted">
          <Link href="/dashboard/study/history" className="text-primary hover:underline">
            学習履歴
          </Link>
        </p>
      </div>
    </StudentPageShell>
  )
}
