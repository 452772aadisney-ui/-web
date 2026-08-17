'use server'

import { revalidatePath } from 'next/cache'
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

async function syncAssignmentStudents(
  assignmentId: string,
  studentIds: string[],
): Promise<string | null> {
  const supabase = await createClient()
  const { error: deleteError } = await supabase
    .from('quiz_assignment_students')
    .delete()
    .eq('quiz_assignment_id', assignmentId)

  if (deleteError) return '対象生徒の更新に失敗しました'
  if (studentIds.length === 0) return null

  const { error: insertError } = await supabase.from('quiz_assignment_students').insert(
    studentIds.map((studentId) => ({
      quiz_assignment_id: assignmentId,
      student_id: studentId,
    })),
  )

  if (insertError) return '対象生徒の更新に失敗しました'
  return null
}

export async function createQuizMaster(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const title = String(formData.get('title') ?? '').trim()
  const subject = String(formData.get('subject') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const maxScore = parseMaxScore(String(formData.get('maxScore') ?? ''))

  if (!title) return { error: 'タイトルを入力してください' }
  if (subject && !EXAM_SUBJECTS.includes(subject as (typeof EXAM_SUBJECTS)[number])) {
    return { error: '教科が不正です' }
  }
  if (!maxScore) return { error: '満点は1以上の整数で入力してください' }

  const supabase = await createClient()
  const { error } = await supabase.from('quiz_masters').insert({
    title,
    subject,
    description,
    max_score: maxScore,
  })

  if (error) return { error: '小テストの登録に失敗しました' }

  revalidateQuizPaths()
  return { success: true }
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

export async function createQuizAssignment(
  _prev: QuizActionState,
  formData: FormData,
): Promise<QuizActionState> {
  const auth = await assertAdmin()
  if ('error' in auth) return { error: auth.error }

  const quizMasterId = String(formData.get('quizMasterId') ?? '').trim()
  const scheduledOn = String(formData.get('scheduledOn') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const studentIds = parseStudentIds(formData)

  if (!quizMasterId) return { error: '小テストを選択してください' }
  if (!scheduledOn) return { error: '実施日を入力してください' }
  if (studentIds.length === 0) return { error: '1名以上の生徒を選択してください' }

  const supabase = await createClient()
  const { data: master } = await supabase
    .from('quiz_masters')
    .select('id, is_active')
    .eq('id', quizMasterId)
    .maybeSingle<{ id: string; is_active: boolean }>()

  if (!master?.is_active) return { error: '選択した小テストが見つかりません' }

  const { data: assignment, error } = await supabase
    .from('quiz_assignments')
    .insert({
      quiz_master_id: quizMasterId,
      scheduled_on: scheduledOn,
      note,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !assignment) return { error: '生徒への登録に失敗しました' }

  const syncError = await syncAssignmentStudents(assignment.id, studentIds)
  if (syncError) return { error: syncError }

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
