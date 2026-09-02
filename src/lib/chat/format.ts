import { getJstDateKey } from '@/lib/study/dates'

const JST = 'Asia/Tokyo'

function diffDateKeys(laterKey: string, earlierKey: string): number {
  return Math.floor((Date.parse(laterKey) - Date.parse(earlierKey)) / 86400000)
}

/** スレッド一覧用（今日なら時刻、それ以外は日付ラベル） */
export function formatChatThreadTime(iso: string | null): string {
  if (!iso) return ''

  const date = new Date(iso)
  const todayKey = getJstDateKey()
  const targetKey = getJstDateKey(date)
  const diffDays = diffDateKeys(todayKey, targetKey)

  if (diffDays === 0) {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: JST,
    })
  }
  if (diffDays === 1) return '昨日'
  if (diffDays < 7) {
    return date.toLocaleDateString('ja-JP', { weekday: 'short', timeZone: JST })
  }
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: JST })
}

/** チャットルーム内のメッセージ日時 */
export function formatChatMessageTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: JST,
  })
}
