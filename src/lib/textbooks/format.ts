function formatDateJa(date: string | null): string {
  if (!date) return '—'
  const [year, month, day] = date.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

export function formatTextbookPeriod(
  startDate: string | null,
  plannedEndDate: string | null,
): string {
  if (!startDate && !plannedEndDate) return '—'
  return `${formatDateJa(startDate)} 〜 ${formatDateJa(plannedEndDate)}`
}

export function parseOptionalDate(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed || null
}

export function validateDateRange(
  startDate: string | null,
  plannedEndDate: string | null,
): string | null {
  if (startDate && plannedEndDate && plannedEndDate < startDate) {
    return '終了予定日は開始日以降にしてください'
  }
  return null
}
