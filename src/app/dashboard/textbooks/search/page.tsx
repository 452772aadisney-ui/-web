import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TextbookSearchMenu } from '@/components/textbooks/TextbookSearchMenu'

export default async function TextbookSearchPage() {
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  return (
    <StudentPageShell
      title="参考書を検索"
      backHref="/dashboard"
      backLabel="マイページ"
    >
      <TextbookSearchMenu />
    </StudentPageShell>
  )
}
