import { EXAM_SUBJECTS, type ExamSubject } from '@/lib/constants/subjects'
import { parseTimeToMinutes } from '@/lib/class-schedule/overlap'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isExamSubject(value: string): value is ExamSubject {
  return (EXAM_SUBJECTS as readonly string[]).includes(value)
}

export function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim()
  const minutes = parseTimeToMinutes(trimmed)
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

/** Empty / whitespace → null. Non-empty must be https://. */
export function normalizeMapUrl(value: string | null | undefined): {
  ok: true
  value: string | null
} | {
  ok: false
  error: string
} {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { ok: true, value: null }
  if (!/^https:\/\//i.test(trimmed)) {
    return { ok: false, error: '地図URLは https:// で始まる必要があります' }
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:') {
      return { ok: false, error: '地図URLは https:// で始まる必要があります' }
    }
  } catch {
    return { ok: false, error: '地図URLの形式が正しくありません' }
  }
  return { ok: true, value: trimmed }
}

export function validateSessionTimes(
  startTime: string,
  endTime: string,
): { ok: true; start: string; end: string } | { ok: false; error: string } {
  const start = normalizeTimeInput(startTime)
  const end = normalizeTimeInput(endTime)
  if (!start || !end) {
    return { ok: false, error: '開始・終了時刻の形式が正しくありません' }
  }
  const startMin = parseTimeToMinutes(start)
  const endMin = parseTimeToMinutes(end)
  if (startMin == null || endMin == null) {
    return { ok: false, error: '開始・終了時刻の形式が正しくありません' }
  }
  if (endMin <= startMin) {
    return { ok: false, error: '終了時刻は開始時刻より後にしてください（日をまたぐ授業は登録できません）' }
  }
  return { ok: true, start, end }
}

export type ParsedSessionDraft = {
  start_time: string
  end_time: string
  subject: ExamSubject
  note: string | null
}

export function parseSessionDraft(input: {
  start_time: string
  end_time: string
  subject: string
  note?: string | null
}): { ok: true; session: ParsedSessionDraft } | { ok: false; error: string } {
  const times = validateSessionTimes(input.start_time, input.end_time)
  if (!times.ok) return times

  const subject = input.subject.trim()
  if (!subject) return { ok: false, error: '科目を選択してください' }
  if (!isExamSubject(subject)) return { ok: false, error: '科目の指定が正しくありません' }

  const noteRaw = (input.note ?? '').trim()
  return {
    ok: true,
    session: {
      start_time: times.start,
      end_time: times.end,
      subject,
      note: noteRaw || null,
    },
  }
}

export function parseDayFields(input: {
  schedule_date: string
  venue_name: string
  address?: string | null
  map_url?: string | null
  room_note?: string | null
}):
  | {
      ok: true
      day: {
        schedule_date: string
        venue_name: string
        address: string | null
        map_url: string | null
        room_note: string | null
      }
    }
  | { ok: false; error: string } {
  const scheduleDate = input.schedule_date.trim()
  if (!isValidScheduleDateKey(scheduleDate)) {
    return { ok: false, error: '日付を正しく入力してください' }
  }

  const venueName = input.venue_name.trim()
  if (!venueName) return { ok: false, error: '会場名を入力してください' }

  const mapResult = normalizeMapUrl(input.map_url)
  if (!mapResult.ok) return mapResult

  const address = (input.address ?? '').trim() || null
  const roomNote = (input.room_note ?? '').trim() || null

  return {
    ok: true,
    day: {
      schedule_date: scheduleDate,
      venue_name: venueName,
      address,
      map_url: mapResult.value,
      room_note: roomNote,
    },
  }
}
