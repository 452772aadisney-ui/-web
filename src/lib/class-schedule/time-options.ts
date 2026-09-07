/** Class-schedule time grid: 08:00–23:00 in 5-minute steps (JST wall clock). */

export const CLASS_SCHEDULE_TIME_MIN_MINUTES = 8 * 60
export const CLASS_SCHEDULE_TIME_MAX_MINUTES = 23 * 60
export const CLASS_SCHEDULE_START_MAX_MINUTES = 22 * 60 + 55
export const CLASS_SCHEDULE_TIME_STEP_MINUTES = 5

export function parseHhMmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  return hours * 60 + minutes
}

export function formatMinutesToHhMm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function isOnFiveMinuteGrid(value: string): boolean {
  const minutes = parseHhMmToMinutes(value)
  if (minutes == null) return false
  return minutes % CLASS_SCHEDULE_TIME_STEP_MINUTES === 0
}

export function isValidClassScheduleStartTime(value: string): boolean {
  const minutes = parseHhMmToMinutes(value)
  if (minutes == null) return false
  if (!isOnFiveMinuteGrid(value)) return false
  return (
    minutes >= CLASS_SCHEDULE_TIME_MIN_MINUTES &&
    minutes <= CLASS_SCHEDULE_START_MAX_MINUTES
  )
}

export function isValidClassScheduleEndTime(value: string): boolean {
  const minutes = parseHhMmToMinutes(value)
  if (minutes == null) return false
  if (!isOnFiveMinuteGrid(value)) return false
  return (
    minutes >= CLASS_SCHEDULE_TIME_MIN_MINUTES + CLASS_SCHEDULE_TIME_STEP_MINUTES &&
    minutes <= CLASS_SCHEDULE_TIME_MAX_MINUTES
  )
}

/** End must be strictly after start; both must be on the allowed grid. */
export function isValidClassScheduleTimeRange(
  start: string,
  end: string,
): boolean {
  if (!isValidClassScheduleStartTime(start) || !isValidClassScheduleEndTime(end)) {
    return false
  }
  const startMin = parseHhMmToMinutes(start)
  const endMin = parseHhMmToMinutes(end)
  if (startMin == null || endMin == null) return false
  return endMin > startMin
}

/**
 * Allow legacy off-grid values only when they match the original session times
 * (do not silently round). New/changed times must be on-grid.
 */
export function isAllowedClassScheduleTimePair(input: {
  start: string
  end: string
  originalStart?: string | null
  originalEnd?: string | null
}): boolean {
  const start = input.start.trim().slice(0, 5)
  const end = input.end.trim().slice(0, 5)
  const originalStart = input.originalStart?.trim().slice(0, 5) ?? null
  const originalEnd = input.originalEnd?.trim().slice(0, 5) ?? null

  const startOk =
    isValidClassScheduleStartTime(start) ||
    (originalStart != null &&
      start === originalStart &&
      parseHhMmToMinutes(start) != null)
  const endOk =
    isValidClassScheduleEndTime(end) ||
    (originalEnd != null &&
      end === originalEnd &&
      parseHhMmToMinutes(end) != null)

  if (!startOk || !endOk) return false
  const startMin = parseHhMmToMinutes(start)
  const endMin = parseHhMmToMinutes(end)
  if (startMin == null || endMin == null) return false
  if (endMin <= startMin) return false
  if (startMin < CLASS_SCHEDULE_TIME_MIN_MINUTES) return false
  if (endMin > CLASS_SCHEDULE_TIME_MAX_MINUTES) return false
  if (startMin > CLASS_SCHEDULE_START_MAX_MINUTES && start !== originalStart) {
    return false
  }
  return true
}

export function listClassScheduleStartTimeOptions(
  extra?: string | null,
): string[] {
  const options: string[] = []
  for (
    let m = CLASS_SCHEDULE_TIME_MIN_MINUTES;
    m <= CLASS_SCHEDULE_START_MAX_MINUTES;
    m += CLASS_SCHEDULE_TIME_STEP_MINUTES
  ) {
    options.push(formatMinutesToHhMm(m))
  }
  const trimmed = extra?.trim().slice(0, 5) ?? ''
  if (
    trimmed &&
    !options.includes(trimmed) &&
    parseHhMmToMinutes(trimmed) != null
  ) {
    options.push(trimmed)
    options.sort()
  }
  return options
}

export function listClassScheduleEndTimeOptions(
  start: string,
  extra?: string | null,
): string[] {
  const startMin = parseHhMmToMinutes(start)
  const options: string[] = []
  const minEnd =
    startMin == null
      ? CLASS_SCHEDULE_TIME_MIN_MINUTES + CLASS_SCHEDULE_TIME_STEP_MINUTES
      : startMin + CLASS_SCHEDULE_TIME_STEP_MINUTES

  for (
    let m = Math.max(
      minEnd,
      CLASS_SCHEDULE_TIME_MIN_MINUTES + CLASS_SCHEDULE_TIME_STEP_MINUTES,
    );
    m <= CLASS_SCHEDULE_TIME_MAX_MINUTES;
    m += CLASS_SCHEDULE_TIME_STEP_MINUTES
  ) {
    // Keep 5-minute alignment from midnight
    if (m % CLASS_SCHEDULE_TIME_STEP_MINUTES !== 0) continue
    options.push(formatMinutesToHhMm(m))
  }

  const trimmed = extra?.trim().slice(0, 5) ?? ''
  if (
    trimmed &&
    !options.includes(trimmed) &&
    parseHhMmToMinutes(trimmed) != null
  ) {
    options.push(trimmed)
    options.sort()
  }
  return options
}

export function isOffGridClassScheduleTime(value: string): boolean {
  const minutes = parseHhMmToMinutes(value)
  if (minutes == null) return false
  return !isOnFiveMinuteGrid(value)
}
