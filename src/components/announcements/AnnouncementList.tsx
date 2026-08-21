import Link from 'next/link'
import type { AnnouncementWithReadStatus } from '@/types/announcement'
import { cn } from '@/lib/utils'

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

interface AnnouncementListProps {
  announcements: AnnouncementWithReadStatus[]
}

export function AnnouncementList({ announcements }: AnnouncementListProps) {
  if (announcements.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted shadow-sm">
        お知らせはありません。
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {announcements.map((announcement) => (
        <li key={announcement.id}>
          <Link
            href={`/dashboard/announcements/${announcement.id}`}
            className={cn(
              'block rounded-2xl border border-border p-5 shadow-sm transition hover:opacity-90',
              announcement.read ? 'bg-white' : 'bg-pink-50',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{announcement.title}</p>
                <p className="mt-1 line-clamp-2 break-all text-sm text-muted">{announcement.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {formatDateTime(announcement.created_at)}
                </p>
              </div>
              {!announcement.read && (
                <span className="shrink-0 rounded-full bg-pink-200 px-2.5 py-0.5 text-xs font-medium text-pink-900">
                  未読
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
