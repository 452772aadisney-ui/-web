import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
import { getPersonName } from '@/lib/auth/display-name'
import type { StudyDayFeedback } from '@/lib/study/feedback'

export type StudentDailyStudySummary = {
  student: {
    id: string
    full_name: string
    display_name: string
    email: string
    student_code: string | null
  }
  logs: StudyLog[]
  totalMinutes: number
  feedback: StudyDayFeedback | null
}

export async function fetchStudyDayFeedback(
  studentId: string,
  studiedOn: string,
): Promise<StudyDayFeedback | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('study_day_feedback')
    .select('*')
    .eq('student_id', studentId)
    .eq('studied_on', studiedOn)
    .maybeSingle()

  return (data as StudyDayFeedback | null) ?? null
}

export async function fetchStudyDayFeedbackForDate(
  studiedOn: string,
): Promise<StudyDayFeedback[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('study_day_feedback')
    .select('*')
    .eq('studied_on', studiedOn)

  return (data as StudyDayFeedback[]) ?? []
}

export async function fetchStudentDailyStudySummaries(
  studiedOn: string,
): Promise<StudentDailyStudySummary[]> {
  const supabase = await createClient()

  const [{ data: logs, error: logsError }, { data: feedbackRows, error: feedbackError }] =
    await Promise.all([
      supabase
        .from('study_logs')
        .select('*')
        .eq('studied_on', studiedOn)
        .order('created_at', { ascending: true }),
      supabase.from('study_day_feedback').select('*').eq('studied_on', studiedOn),
    ])

  if (logsError || feedbackError || !logs?.length) {
    return []
  }

  const studentIds = [...new Set(logs.map((log) => log.student_id as string))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, student_code')
    .in('id', studentIds)
    .eq('role', 'student')

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]))
  const feedbackByStudentId = new Map(
    ((feedbackRows ?? []) as StudyDayFeedback[]).map((feedback) => [
      feedback.student_id,
      feedback,
    ]),
  )

  const logsByStudent = new Map<string, StudyLog[]>()
  for (const log of logs as StudyLog[]) {
    const list = logsByStudent.get(log.student_id) ?? []
    list.push(log)
    logsByStudent.set(log.student_id, list)
  }

  const summaries: StudentDailyStudySummary[] = []

  for (const studentId of studentIds) {
    const student = profileById.get(studentId)
    if (!student) continue

    const studentLogs = logsByStudent.get(studentId) ?? []
    summaries.push({
      student: student as StudentDailyStudySummary['student'],
      logs: studentLogs,
      totalMinutes: studentLogs.reduce((sum, log) => sum + log.duration_minutes, 0),
      feedback: feedbackByStudentId.get(studentId) ?? null,
    })
  }

  summaries.sort((a, b) =>
    getPersonName(a.student).localeCompare(getPersonName(b.student), 'ja'),
  )

  return summaries
}

export const fetchUnreadStudyFeedbackCount = cache(
  async (studentId: string): Promise<number> => {
    const supabase = await createClient()

    const [{ data: feedbackRows, error: feedbackError }, { data: readRows, error: readError }] =
      await Promise.all([
        supabase
          .from('study_day_feedback')
          .select('id, comment')
          .eq('student_id', studentId),
        supabase
          .from('study_day_feedback_reads')
          .select('feedback_id')
          .eq('student_id', studentId),
      ])

    if (feedbackError || readError) {
      return 0
    }

    const readIds = new Set((readRows ?? []).map((row) => row.feedback_id as string))
    return (feedbackRows ?? []).filter((row) => {
      const comment = String(row.comment ?? '').trim()
      return comment.length > 0 && !readIds.has(row.id as string)
    }).length
  },
)

export async function markStudyFeedbackAsRead(
  feedbackId: string,
  studentId: string,
): Promise<void> {
  const supabase = await createClient()
  await supabase.from('study_day_feedback_reads').upsert(
    {
      feedback_id: feedbackId,
      student_id: studentId,
    },
    { onConflict: 'feedback_id,student_id' },
  )
}
