import Link from 'next/link'

interface CoachingAlertBannerProps {
  message: string
}

export function CoachingAlertBanner({ message }: CoachingAlertBannerProps) {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-900">コーチングの予約が必要です</p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-800">{message}</p>
        </div>
        <Link
          href="/dashboard/coaching"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          予約 →
        </Link>
      </div>
    </section>
  )
}
