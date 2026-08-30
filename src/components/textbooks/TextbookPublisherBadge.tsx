export function getDisplayPublisher(publisher: string | null | undefined): string | null {
  const trimmed = publisher?.trim()
  return trimmed || null
}

export function TextbookPublisherBadge({ publisher }: { publisher: string | null | undefined }) {
  const label = getDisplayPublisher(publisher)
  if (!label) return null

  return (
    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
      {label}
    </span>
  )
}
