import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { MarkAnnouncementRead } from '@/components/announcements/MarkAnnouncementRead'
import { fetchAnnouncementById } from '@/lib/announcements/queries'

export const dynamic = 'force-dynamic'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function StudentAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const announcement = await fetchAnnouncementById(id)
  if (!announcement) notFound()

  return (
    <StudentPageShell title="お知らせ" backHref="/dashboard/announcements" backLabel="お知らせ一覧">
      <MarkAnnouncementRead announcementId={id} />
      <article className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{announcement.title}</h2>
        <p className="mt-2 text-sm text-muted">{formatDateTime(announcement.created_at)}</p>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{announcement.body}</div>
      </article>
      <Link
        href="/dashboard/announcements"
        className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
      >
        ← お知らせ一覧に戻る
      </Link>
    </StudentPageShell>
  )
}
