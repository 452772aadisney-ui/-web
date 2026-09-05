import { describe, expect, it } from 'vitest'
import {
  KARTE_HISTORY_PAGE_SIZE,
  KARTE_MAIN_HISTORY_PAGE_SIZE,
} from '@/lib/coaching/karte-constants'

describe('karte page size constants', () => {
  it('uses 5 for main preview and 20 for history page', () => {
    expect(KARTE_MAIN_HISTORY_PAGE_SIZE).toBe(5)
    expect(KARTE_HISTORY_PAGE_SIZE).toBe(20)
  })
})
