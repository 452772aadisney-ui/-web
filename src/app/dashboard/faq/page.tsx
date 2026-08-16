import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { StudentFaqList } from '@/components/faq/StudentFaqList'
import { fetchPublishedFaq, markFaqIntroSeenForProfile } from '@/lib/faq/queries'

export const dynamic = 'force-dynamic'

export default async function StudentFaqPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect('/admin')

  await markFaqIntroSeenForProfile(profile.id)

  const categories = await fetchPublishedFaq()

  return (
    <StudentPageShell title="よくある質問" backHref="/dashboard" backLabel="マイページ">
      <p className="mb-6 text-sm text-muted">
        アプリの使い方やよくある疑問への回答です。質問をタップすると回答が表示されます。
      </p>
      <StudentFaqList categories={categories} />
    </StudentPageShell>
  )
}
