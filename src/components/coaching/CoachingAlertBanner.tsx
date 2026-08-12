import Link from 'next/link'

interface CoachingAlertBannerProps {
  message: string
}

export function CoachingAlertBanner({ message }: CoachingAlertBannerProps) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">コーチングの予約が必要です</p>
          <p className="mt-1 text-sm text-amber-800">{message}</p>
        </div>
        <Link
          href="/dashboard/coaching"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          予約する →
        </Link>
      </div>
    </section>
  )
}
