import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('syncCalendarAfterCoachingReschedule guards', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/coaching/reschedule-calendar-sync.ts'),
    'utf8',
  )
  const eventsSource = readFileSync(
    join(process.cwd(), 'src/lib/google-calendar/events.ts'),
    'utf8',
  )

  it('CAS on schedule_revision and uses Google If-Match etags', () => {
    expect(source).toContain('schedule_revision !== changeRevision')
    expect(source).toContain(".eq('schedule_revision', params.changeRevision)")
    expect(source).toContain("return 'skipped_stale'")
    expect(source).toContain('ifMatchEtag')
    expect(eventsSource).toContain("'If-Match'")
    expect(eventsSource).toContain('precondition_failed')
  })
})
