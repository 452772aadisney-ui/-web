import type { CoachingKarteEntryWithDetails } from '@/types/coaching'

export function isCoachingKarteTableMissingError(message: string): boolean {
  return (
    message.includes('coaching_karte_entries') &&
    (message.includes('Could not find the table') ||
      message.includes('schema cache') ||
      message.includes('does not exist'))
  )
}

export type CoachingKarteFetchResult = {
  entries: CoachingKarteEntryWithDetails[]
  tableAvailable: boolean
  totalCount?: number
  page?: number
  pageSize?: number
}
