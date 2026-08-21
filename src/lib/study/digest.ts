import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { getPersonName } from '@/lib/auth/display-name'
import { formatDuration, type StudyLog } from '@/lib/study/chart-data'
import { formatStudyDateLabel, getJstDateKey, shiftDateKey } from '@/lib/study/dates'
import { createAdminClient } from '@/lib/supabase/admin'

export type StudentStudyDigestEntry = {
  studentId: string
  name: string
  logs: StudyLog[]
  totalMinutes: number
}

export type DailyStudyDigestReport = {
  dateKey: string
  dateLabel: string
  recorded: StudentStudyDigestEntry[]
  notRecorded: Array<{ studentId: string; name: string; email: string | null }>
}

function formatLogLine(log: StudyLog): string {
  const subject = resolveStudySubjectCategory(log.subject) ?? log.subject
  const parts = [`${subject} ${formatDuration(log.duration_minutes)}`]
  if (log.textbook_name.trim()) {
    parts.push(`（${log.textbook_name.trim()}）`)
  }
  return parts.join('')
}

export function getYesterdayDateKeyJst(now = new Date()): string {
  const todayJst = getJstDateKey(now)
  return shiftDateKey(todayJst, -1)
}

export async function buildDailyStudyDigestReport(
  dateKey: string,
): Promise<DailyStudyDigestReport | null> {
  const supabase = createAdminClient()
  if (!supabase) {
    console.warn('[study-digest] SUPABASE_SERVICE_ROLE_KEY is not configured')
    return null
  }

  const [{ data: students, error: studentsError }, { data: logs, error: logsError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, display_name, email')
        .eq('role', 'student')
        .order('full_name'),
      supabase.from('study_logs').select('*').eq('studied_on', dateKey),
    ])

  if (studentsError || logsError) {
    console.error('[study-digest] query failed:', studentsError?.message, logsError?.message)
    return null
  }

  const logsByStudent = new Map<string, StudyLog[]>()
  for (const log of (logs ?? []) as StudyLog[]) {
    const list = logsByStudent.get(log.student_id) ?? []
    list.push(log)
    logsByStudent.set(log.student_id, list)
  }

  const recorded: StudentStudyDigestEntry[] = []
  const notRecorded: Array<{ studentId: string; name: string; email: string | null }> = []

  for (const student of students ?? []) {
    const studentLogs = (logsByStudent.get(student.id) ?? []).sort(
      (a, b) => a.created_at.localeCompare(b.created_at),
    )
    const name = getPersonName(student as { full_name: string; display_name: string })
    const email = typeof student.email === 'string' ? student.email.trim() || null : null

    if (studentLogs.length === 0) {
      notRecorded.push({ studentId: student.id, name, email })
      continue
    }

    recorded.push({
      studentId: student.id,
      name,
      logs: studentLogs,
      totalMinutes: studentLogs.reduce((sum, log) => sum + log.duration_minutes, 0),
    })
  }

  recorded.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  notRecorded.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  const todayJst = getJstDateKey()
  return {
    dateKey,
    dateLabel: formatStudyDateLabel(dateKey, todayJst),
    recorded,
    notRecorded,
  }
}

export function formatDailyStudyDigestDescription(report: DailyStudyDigestReport): string {
  const lines: string[] = [
    `対象日: ${report.dateLabel}（${report.dateKey}）`,
    '',
    `■ 記録あり（${report.recorded.length}名）`,
  ]

  if (report.recorded.length === 0) {
    lines.push('なし')
  } else {
    for (const student of report.recorded) {
      const details = student.logs.map((log) => formatLogLine(log)).join(' / ')
      lines.push(
        `・${student.name}: 合計 ${formatDuration(student.totalMinutes)} — ${details}`,
      )
    }
  }

  lines.push('')
  lines.push(`■ 記録なし（${report.notRecorded.length}名）`)

  if (report.notRecorded.length === 0) {
    lines.push('なし')
  } else {
    for (const student of report.notRecorded) {
      lines.push(`・${student.name}`)
    }
  }

  const description = lines.join('\n')
  if (description.length <= 4096) {
    return description
  }

  return `${description.slice(0, 4090)}…`
}

export async function buildTodayMissingStudyReport(
  dateKey = getJstDateKey(),
): Promise<DailyStudyDigestReport | null> {
  return buildDailyStudyDigestReport(dateKey)
}
