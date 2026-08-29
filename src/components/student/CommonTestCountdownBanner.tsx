interface CommonTestCountdownBannerProps {
  daysRemaining: number
  className?: string
}

export function CommonTestCountdownBanner({
  daysRemaining,
  className,
}: CommonTestCountdownBannerProps) {
  return (
    <section
      className={`rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-2 shadow-sm ${className ?? ''}`}
    >
      <p className="text-[10px] font-semibold leading-none text-muted">共テまで</p>
      <p className="mt-1 text-lg font-bold leading-none text-foreground">
        あと
        <span className="mx-0.5 text-sky-600">{daysRemaining}</span>
        日
      </p>
    </section>
  )
}
