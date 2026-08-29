import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TextbookSubjectTagFilter } from '@/components/textbooks/TextbookSubjectTagFilter'

export default async function TextbookSearchSubjectsPage() {
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  return (
    <StudentPageShell
      title="教科書を検索"
      backHref="/dashboard/textbooks/search"
      backLabel="検索メニュー"
    >
      <TextbookSubjectTagFilter />
    </StudentPageShell>
  )
}
