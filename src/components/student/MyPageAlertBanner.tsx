import Link from 'next/link'

interface MyPageAlertBannerProps {
  title: string
  message: string
  href: string
  actionLabel: string
}

export function MyPageAlertBanner({ title, message, href, actionLabel }: MyPageAlertBannerProps) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-1 text-sm text-amber-800">{message}</p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {actionLabel} →
        </Link>
      </div>
    </section>
  )
}
