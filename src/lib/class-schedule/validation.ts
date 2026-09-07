import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import {
  isAllowedClassScheduleTimePair,
  isOffGridClassScheduleTime,
  parseHhMmToMinutes,
} from '@/lib/class-schedule/time-options'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export const CLASS_SCHEDULE_SUBJECT_MAX_LENGTH = 100
export const CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH = 2000
export const CLASS_SCHEDULE_NOTE_MAX_LENGTH = 500
export const CLASS_SCHEDULE_VENUE_MAX_LENGTH = 200

/** Subject suggestions only — free text is always allowed. */
export const CLASS_SCHEDULE_SUBJECT_SUGGESTIONS: readonly string[] = EXAM_SUBJECTS

export function normalizeTimeInput(value: string): string | null {
  const minutes = parseHhMmToMinutes(value.trim())
  if (minutes == null) return null
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function isValidScheduleDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** Trim edges only; keep internal newlines. Empty → null. */
export function normalizeLocationDetails(value: string | null | undefined): {
  ok: true
  value: string | null
} | {
  ok: false
  error: string
} {
  if (value == null) return { ok: true, value: null }
  const trimmed = value.replace(/^\s+|\s+$/g, '')
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH) {
    return {
      ok: false,
      error: `場所の詳細は${CLASS_SCHEDULE_LOCATION_DETAILS_MAX_LENGTH}文字以内で入力してください`,
    }
  }
  return { ok: true, value: trimmed }
}

export function normalizeSubject(value: string): {
  ok: true
  value: string
} | {
  ok: false
  error: string
} {
  const subject = value.trim()
  if (!subject) return { ok: false, error: '科目を入力してください' }
  if (subject.length > CLASS_SCHEDULE_SUBJECT_MAX_LENGTH) {
    return {
      ok: false,
      error: `科目は${CLASS_SCHEDULE_SUBJECT_MAX_LENGTH}文字以内で入力してください`,
    }
  }
  return { ok: true, value: subject }
}

export function validateSessionTimes(
  startTime: string,
  endTime: string,
  options?: { originalStart?: string | null; originalEnd?: string | null },
): { ok: true; start: string; end: string } | { ok: false; error: string } {
  const start = normalizeTimeInput(startTime)
  const end = normalizeTimeInput(endTime)
  if (!start || !end) {
    return { ok: false, error: '開始・終了時刻の形式が正しくありません' }
  }

  if (
    !isAllowedClassScheduleTimePair({
      start,
      end,
      originalStart: options?.originalStart,
      originalEnd: options?.originalEnd,
    })
  ) {
    if (end <= start) {
      return {
        ok: false,
        error:
          '終了時刻は開始時刻より後にしてください（日をまたぐ授業は登録できません）',
      }
    }
    return {
      ok: false,
      error:
        '時刻は8:00〜23:00の5分刻みで指定してください（開始は22:55まで）',
    }
  }

  return { ok: true, start, end }
}

export type ParsedSessionDraft = {
  start_time: string
  end_time: string
  subject: string
  note: string | null
}

export function parseSessionDraft(input: {
  start_time: string
  end_time: string
  subject: string
  note?: string | null
  originalStart?: string | null
  originalEnd?: string | null
}): { ok: true; session: ParsedSessionDraft } | { ok: false; error: string } {
  const times = validateSessionTimes(input.start_time, input.end_time, {
    originalStart: input.originalStart,
    originalEnd: input.originalEnd,
  })
  if (!times.ok) return times

  const subject = normalizeSubject(input.subject)
  if (!subject.ok) return subject

  const noteRaw = (input.note ?? '').trim()
  if (noteRaw.length > CLASS_SCHEDULE_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `補足は${CLASS_SCHEDULE_NOTE_MAX_LENGTH}文字以内で入力してください`,
    }
  }

  return {
    ok: true,
    session: {
      start_time: times.start,
      end_time: times.end,
      subject: subject.value,
      note: noteRaw || null,
    },
  }
}

export function parseDayFields(input: {
  schedule_date: string
  venue_name: string
  location_details?: string | null
}):
  | {
      ok: true
      day: {
        schedule_date: string
        venue_name: string
        location_details: string | null
      }
    }
  | { ok: false; error: string } {
  const scheduleDate = input.schedule_date.trim()
  if (!isValidScheduleDateKey(scheduleDate)) {
    return { ok: false, error: '日付を正しく入力してください' }
  }

  const venueName = input.venue_name.trim()
  if (!venueName) return { ok: false, error: '会場名を入力してください' }
  if (venueName.length > CLASS_SCHEDULE_VENUE_MAX_LENGTH) {
    return {
      ok: false,
      error: `会場名は${CLASS_SCHEDULE_VENUE_MAX_LENGTH}文字以内で入力してください`,
    }
  }

  const location = normalizeLocationDetails(input.location_details)
  if (!location.ok) return location

  return {
    ok: true,
    day: {
      schedule_date: scheduleDate,
      venue_name: venueName,
      location_details: location.value,
    },
  }
}

export function offGridTimeWarning(start: string, end: string): string | null {
  if (isOffGridClassScheduleTime(start) || isOffGridClassScheduleTime(end)) {
    return 'このコマは5分刻み以外の時刻です。変更する場合は8:00〜23:00の5分刻みを選んでください。'
  }
  return null
}
