/** Format an ISO timestamp in Asia/Tokyo for admin/student display. */
export function formatJstDateTime(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = String(Number(get('hour')))
  const minute = get('minute')

  return `${year}/${month}/${day} ${hour}:${minute}`
}

/** Format a YYYY-MM-DD calendar key as `YYYY年M月D日` (JST calendar date parts). */
export function formatJstDateLabelFromDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return `${year}年${month}月${day}日`
}
