'use client'

import { useState } from 'react'
import { MAX_STUDY_DURATION_MINUTES } from '@/lib/study/validation'

const fieldClass =
  'block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

const chipClass =
  'rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary/5'

const DURATION_CHIPS = [
  { label: '+30分', minutes: 30 },
  { label: '+60分', minutes: 60 },
  { label: '+90分', minutes: 90 },
] as const

export function StudyDurationInput({
  defaultValue = '',
}: {
  defaultValue?: string | number
}) {
  const [duration, setDuration] = useState(String(defaultValue || ''))

  function addMinutes(minutes: number) {
    const current = Number(duration) || 0
    const next = Math.min(MAX_STUDY_DURATION_MINUTES, current + minutes)
    setDuration(String(next))
  }

  return (
    <label className="block w-full min-w-0 sm:max-w-xs">
      <span className="mb-1.5 block text-sm font-medium">
        学習時間（分） <span className="text-error">*</span>
      </span>
      <input
        type="number"
        name="durationMinutes"
        min={1}
        max={MAX_STUDY_DURATION_MINUTES}
        step={1}
        required
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
        placeholder="60"
        className={fieldClass}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {DURATION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => addMinutes(chip.minutes)}
            className={chipClass}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <span className="mt-1 block text-xs text-muted">
        1〜{MAX_STUDY_DURATION_MINUTES}分の整数
      </span>
    </label>
  )
}
