import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('syncCalendarAfterCoachingReschedule guards', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/coaching/reschedule-calendar-sync.ts'),
    'utf8',
  )

  it('re-reads booking revision before patching or attaching calendar events', () => {
    expect(source).toContain('booked_at !== params.changeRevision')
    expect(source).toContain(".eq('booked_at', params.changeRevision)")
    expect(source).toContain("return 'skipped_stale'")
  })
})
