'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseOptionalDate, validateDateRange } from '@/lib/textbooks/format'

export type TextbookActionState = {
  error?: string
  success?: boolean
}

function parseSubjects(formData: FormData, allowedSubjects: string[]): string[] {
  return allowedSubjects.filter((subject) => formData.get(`subject_${subject}`) === 'on')
}

function parseTextbookDates(formData: FormData): {
  startDate: string | null
  plannedEndDate: string | null
  error: string | null
} {
  const startDate = parseOptionalDate(String(formData.get('startDate') ?? ''))
  const plannedEndDate = parseOptionalDate(String(formData.get('plannedEndDate') ?? ''))
  const rangeError = validateDateRange(startDate, plannedEndDate)
  return { startDate, plannedEndDate, error: rangeError }
}

async function getAllowedSubjectsForStudent(
  studentId: string,
): Promise<string[] | null> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('subjects')
    .eq('id', studentId)
    .maybeSingle<{ subjects: string[] }>()

  return profile?.subjects ?? null
}

async function assertCanManageStudent(studentId: string): Promise<string | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return 'ログインが必要です'
  }

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  const isAdmin = actorProfile?.role === 'admin'
  if (user.id !== studentId && !isAdmin) {
    return '権限がありません'
  }

  return null
}

function revalidateTextbookPaths(studentId: string) {
  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard/bookshelf')
  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/admin/textbooks')
  revalidatePath(`/admin/students/${studentId}`)
}

export async function createTextbook(
  studentId: string,
  _prevState: TextbookActionState,
  formData: FormData,
): Promise<TextbookActionState> {
  const authError = await assertCanManageStudent(studentId)
  if (authError) return { error: authError }

  const supabase = await createClient()
  const name = String(formData.get('name') ?? '').trim()
  const allowedSubjects = (await getAllowedSubjectsForStudent(studentId)) ?? []
  const subjects = parseSubjects(formData, allowedSubjects)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)

  if (!name) {
    return { error: '教材名を入力してください' }
  }

  if (subjects.length === 0) {
    return { error: '科目タグを1つ以上選択してください' }
  }

  if (dateError) {
    return { error: dateError }
  }

  const { error } = await supabase.from('textbooks').insert({
    student_id: studentId,
    name,
    subjects,
    start_date: startDate,
    planned_end_date: plannedEndDate,
  })

  if (error) {
    return { error: '教材の登録に失敗しました' }
  }

  revalidateTextbookPaths(studentId)
  return { success: true }
}

export async function updateTextbook(
  studentId: string,
  _prevState: TextbookActionState,
  formData: FormData,
): Promise<TextbookActionState> {
  const authError = await assertCanManageStudent(studentId)
  if (authError) return { error: authError }

  const supabase = await createClient()
  const textbookId = String(formData.get('textbookId') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const allowedSubjects = (await getAllowedSubjectsForStudent(studentId)) ?? []
  const subjects = parseSubjects(formData, allowedSubjects)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)

  if (!textbookId) {
    return { error: '教材が指定されていません' }
  }

  if (!name) {
    return { error: '教材名を入力してください' }
  }

  if (subjects.length === 0) {
    return { error: '科目タグを1つ以上選択してください' }
  }

  if (dateError) {
    return { error: dateError }
  }

  const { error } = await supabase
    .from('textbooks')
    .update({
      name,
      subjects,
      start_date: startDate,
      planned_end_date: plannedEndDate,
    })
    .eq('id', textbookId)
    .eq('student_id', studentId)

  if (error) {
    return { error: '教材の更新に失敗しました' }
  }

  revalidateTextbookPaths(studentId)
  return { success: true }
}

export async function deleteTextbook(formData: FormData): Promise<void> {
  const textbookId = String(formData.get('textbookId') ?? '')
  const studentId = String(formData.get('studentId') ?? '')
  if (!textbookId) return

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase.from('textbooks').delete().eq('id', textbookId)

  if (studentId) {
    revalidateTextbookPaths(studentId)
  }
}
