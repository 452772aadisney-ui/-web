'use server'

import { revalidatePath } from 'next/cache'
import { getPersonName } from '@/lib/auth/display-name'
import { createQuizStudentCalendarEvent } from '@/lib/google-calendar/events'
import { createClient } from '@/lib/supabase/server'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'

export type QuizActionState = {
  error?: string
  success?: boolean
}

async function assertAdmin(): Promise<{ error: string } | { userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return { error: '管理者権限が必要です' }
  return { userId: user.id }
}

function revalidateQuizPaths(studentId?: string) {
  revalidatePath('/admin/quizzes')
  revalidatePath('/dashboard/quizzes')
  revalidatePath('/dashboard/calendar')
  if (studentId) {
    revalidatePath(`/admin/students/${studentId}`)
  }
}

function parseStudentIds(formData: FormData): string[] {
  return formData.getAll('targetStudentIds').map(String).filter(Boolean)
}

function parseMaxScore(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return null
  return value
}

function parseScore(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

async function registerQuizForStudent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  studentName: string,
  fields: {
    title: string
    subject: string
    description: string
    maxScore: number
    scheduledOn: string
    note: string
  },
): Promise<{ error: string | null; assignmentId?: string }> {
  const { data: master, error: masterError } = await supabase
    .from('quiz_masters')
    .insert({
      title: fields.title,
      subject: fields.subject,
      description: fields.description,
      max_score: fields.maxScore,
    })
    .select('id, title, subject')
    .single<{ id: string; title: string; subject: string }>()

  if (masterError || !master) return { error: '小テストの登録に失敗しました' }

  const { data: assignment, error: assignmentError } = await supabase
    .from('quiz_assignments')
    .insert({
      quiz_master_id: master.id,
      scheduled_on: fields.scheduledOn,
      note: fields.note,
    })
    .select('id')
    .single<{ id: string }>()

  if (assignmentError || !assignment) return { error: '小テストの登録に失敗しました' }

  const { error: studentError } = await supabase.from('quiz_assignment_students').insert({
    quiz_assignment_id: assignment.id,
    student_id: studentId,
  })

  if (studentError) return { error: '対象生徒の登録に失敗しました' }

  const eventId = await createQuizStudentCalendarEvent({
    studentName,
    title: master.title,
    subject: master.subject,
    scheduledOn: fields.scheduledOn,
    note: fields.note,
  })

  if (eventId) {
    await supabase
      .from('quiz_assignment_students')
      .update({ google_calendar_event_id: eventId })
      .eq('quiz_assignment_id', assignment.id)
      .eq('student_id', studentId)
  }

  return { error: null, assignmentId: assignment.id }
}

export async function updateQuizMaster(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const subject = String(formData.get('subject') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const maxScore = parseMaxScore(String(formData.get('maxScore') ?? ''))
  const isActive = formData.get('isActive') === 'on'

  if (!id) return { error: 'IDが不正です' }
  if (!title) return { error: 'タイトルを入力してください' }
  if (subject && !EXAM_SUBJECTS.includes(subject as (typeof EXAM_SUBJECTS)[number])) {
    return { error: '教科が不正です' }
  }
  if (!maxScore) return { error: '満点は1以上の整数で入力してください' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('quiz_masters')
    .update({
      title,
      subject,
      description,
      max_score: maxScore,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) return { error: '小テストの更新に失敗しました' }

  revalidateQuizPaths()
  return { success: true }
}

export async function deleteQuizMaster(formData: FormData): Promise<void> {
  const auth = await assertAdmin()
  if ('error' in auth) return

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const supabase = await createClient()
  await supabase.from('quiz_masters').delete().eq('id', id)
  revalidateQuizPaths()
}

export async function registerStudentQuizzes(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const title = String(formData.get('title') ?? '').trim()
  const subject = String(formData.get('subject') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const maxScore = parseMaxScore(String(formData.get('maxScore') ?? ''))
  const scheduledOn = String(formData.get('scheduledOn') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!title) return { error: 'タイトルを入力してください' }
  if (subject && !EXAM_SUBJECTS.includes(subject as (typeof EXAM_SUBJECTS)[number])) {
    return { error: '教科が不正です' }
  }
  if (!maxScore) return { error: '満点は1以上の整数で入力してください' }
  if (!scheduledOn) return { error: '実施日を入力してください' }
  if (studentIds.length === 0) return { error: '1名以上の生徒を選択してください' }

  const supabase = await createClient()

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, role')
    .in('id', studentIds)

  const validStudents = (students ?? []).filter((student) => student.role === 'student')
  if (validStudents.length === 0) return { error: '有効な生徒が選択されていません' }

  const fields = { title, subject, description, maxScore, scheduledOn, note }

  for (const student of validStudents) {
    const studentName = getPersonName(
      student as { full_name: string; display_name: string },
    )
    const result = await registerQuizForStudent(
      supabase,
      String(student.id),
      studentName,
      fields,
    )
    if (result.error) return { error: result.error }

    revalidateQuizPaths(String(student.id))
    if (result.assignmentId) {
      revalidatePath(`/admin/quizzes/assignments/${result.assignmentId}`)
    }
  }

  revalidateQuizPaths()
  return { success: true }
}

export async function saveQuizResult(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const assignmentId = String(formData.get('assignmentId') ?? '').trim()
  const studentId = String(formData.get('studentId') ?? '').trim()
  const scoreRaw = String(formData.get('score') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  if (!assignmentId || !studentId) return { error: '保存対象が不正です' }

  const supabase = await createClient()

  const [{ data: assignment }, { data: membership }] = await Promise.all([
    supabase
      .from('quiz_assignments')
      .select('id, quiz_master_id')
      .eq('id', assignmentId)
      .maybeSingle<{ id: string; quiz_master_id: string }>(),
    supabase
      .from('quiz_assignment_students')
      .select('student_id')
      .eq('quiz_assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle(),
  ])

  if (!assignment || !membership) return { error: '対象の小テストが見つかりません' }

  const { data: master } = await supabase
    .from('quiz_masters')
    .select('max_score')
    .eq('id', assignment.quiz_master_id)
    .maybeSingle<{ max_score: number }>()

  if (!master) return { error: '小テスト情報が見つかりません' }

  if (!scoreRaw) {
    await supabase
      .from('quiz_results')
      .delete()
      .eq('quiz_assignment_id', assignmentId)
      .eq('student_id', studentId)

    revalidateQuizPaths(studentId)
    revalidatePath(`/admin/quizzes/assignments/${assignmentId}`)
    return { success: true }
  }

  const score = parseScore(scoreRaw)
  if (score == null) return { error: '点数を正しく入力してください' }
  if (score > master.max_score) {
    return { error: `点数は満点（${master.max_score}点）以下で入力してください` }
  }

  const payload = {
    quiz_assignment_id: assignmentId,
    student_id: studentId,
    score,
    max_score: master.max_score,
    note,
    recorded_by: auth.userId,
    recorded_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('quiz_results')
    .select('id')
    .eq('quiz_assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle<{ id: string }>()

  const { error } = existing
    ? await supabase.from('quiz_results').update(payload).eq('id', existing.id)
    : await supabase.from('quiz_results').insert(payload)

  if (error) return { error: '点数の保存に失敗しました' }

  revalidateQuizPaths(studentId)
  revalidatePath(`/admin/quizzes/assignments/${assignmentId}`)
  return { success: true }
}

export async function saveQuizResultsBulk(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const assignmentId = String(formData.get('assignmentId') ?? '').trim()
  const entriesJson = String(formData.get('entriesJson') ?? '').trim()

  if (!assignmentId || !entriesJson) return { error: '保存データが不正です' }

  let entries: Array<{ studentId: string; score: string; note: string }>
  try {
    entries = JSON.parse(entriesJson)
  } catch {
    return { error: '保存データの形式が不正です' }
  }

  for (const entry of entries) {
    const innerForm = new FormData()
    innerForm.set('assignmentId', assignmentId)
    innerForm.set('studentId', entry.studentId)
    innerForm.set('score', entry.score)
    innerForm.set('note', entry.note ?? '')
    const result = await saveQuizResult({}, innerForm)
    if (result.error) return result
  }

  return { success: true }
}
