'use client'

import {
  listClassScheduleEndTimeOptions,
  listClassScheduleStartTimeOptions,
} from '@/lib/class-schedule/time-options'
import { classScheduleFieldClass } from '@/lib/class-schedule/format'
import { offGridTimeWarning } from '@/lib/class-schedule/validation'

type SessionTimeRangeFieldsProps = {
  startName?: string
  endName?: string
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  disabled?: boolean
  /** Keep off-grid legacy values selectable while editing. */
  allowOriginalTimes?: boolean
  idPrefix?: string
}

export function SessionTimeRangeFields({
  startName = 'startTime',
  endName = 'endTime',
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  disabled = false,
  allowOriginalTimes = false,
  idPrefix = 'session-time',
}: SessionTimeRangeFieldsProps) {
  const startOptions = listClassScheduleStartTimeOptions(
    allowOriginalTimes ? startValue : null,
  )
  const endOptions = listClassScheduleEndTimeOptions(
    startValue,
    allowOriginalTimes ? endValue : null,
  )
  const warning = offGridTimeWarning(startValue, endValue)
  const endSelectValue = endOptions.includes(endValue)
    ? endValue
    : (endOptions[0] ?? endValue)

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[5.5rem] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">開始</span>
          <select
            id={`${idPrefix}-start`}
            name={startName}
            required
            disabled={disabled}
            value={startValue}
            aria-label="開始時刻"
            onChange={(event) => {
              const nextStart = event.target.value
              onStartChange(nextStart)
              const nextEnds = listClassScheduleEndTimeOptions(
                nextStart,
                allowOriginalTimes ? endValue : null,
              )
              if (!nextEnds.includes(endValue) && nextEnds[0]) {
                onEndChange(nextEnds[0])
              }
            }}
            className={classScheduleFieldClass}
          >
            {startOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-sm text-muted" aria-hidden="true">
          ～
        </span>
        <label className="min-w-[5.5rem] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">終了</span>
          <select
            id={`${idPrefix}-end`}
            name={endName}
            required
            disabled={disabled}
            value={endSelectValue}
            aria-label="終了時刻"
            onChange={(event) => onEndChange(event.target.value)}
            className={classScheduleFieldClass}
          >
            {endOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      {warning && <p className="text-xs text-amber-800">{warning}</p>}
    </div>
  )
}
