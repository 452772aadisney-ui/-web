'use server'

import { evaluateAndUnlockAchievements, type UnlockedAchievement } from '@/lib/achievements/unlock'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TEXTBOOK_USAGE_TAGS } from '@/lib/constants/textbook-tags'
import { parseOptionalDate, validateDateRange } from '@/lib/textbooks/format'

export type TextbookActionState = {
  error?: string
  success?: boolean
  unlockedAchievements?: UnlockedAchievement[]
}

function parseSubjects(formData: FormData, allowedSubjects: string[]): string[] {
  return allowedSubjects.filter((subject) => formData.get(`subject_${subject}`) === 'on')
}

function parseUsageTags(formData: FormData): string[] {
  return TEXTBOOK_USAGE_TAGS.filter((tag) => formData.get(`usage_${tag}`) === 'on')
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

function parseStudentIds(formData: FormData): string[] {
  return formData
    .getAll('studentIds')
    .map((value) => String(value).trim())
    .filter(Boolean)
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

async function getActorContext(): Promise<
  | { userId: string; isAdmin: boolean }
  | { error: string }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインが必要です' }
  }

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  return {
    userId: user.id,
    isAdmin: actorProfile?.role === 'admin',
  }
}

async function assertCanManageStudent(studentId: string): Promise<string | null> {
  const actor = await getActorContext()
  if ('error' in actor) return actor.error

  if (actor.userId !== studentId && !actor.isAdmin) {
    return '権限がありません'
  }

  return null
}

function revalidateTextbookPaths(studentId: string) {
  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard/bookshelf')
  revalidatePath('/dashboard/textbooks/register')
  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard')
  revalidatePath('/admin/textbooks')
  revalidatePath('/admin/bookshelf')
  revalidatePath(`/admin/students/${studentId}`)
}

function revalidateAllStudentPaths(studentIds: string[]) {
  for (const studentId of studentIds) {
    revalidateTextbookPaths(studentId)
  }
}

export async function createTextbook(
  studentId: string,
  _prevState: TextbookActionState,
  formData: FormData,
): Promise<TextbookActionState> {
  const authError = await assertCanManageStudent(studentId)
  if (authError) return { error: authError }

  const actor = await getActorContext()
  if ('error' in actor) return { error: actor.error }

  const supabase = await createClient()
  const name = String(formData.get('name') ?? '').trim()
  const allowedSubjects = (await getAllowedSubjectsForStudent(studentId)) ?? []
  const subjects = parseSubjects(formData, allowedSubjects)
  const usageTags = parseUsageTags(formData)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)

  if (!name) return { error: '教材名を入力してください' }
  if (subjects.length === 0) return { error: '科目タグを1つ以上選択してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (dateError) return { error: dateError }

  const isAdminRegistration = actor.isAdmin && actor.userId !== studentId

  const { error } = await supabase.from('textbooks').insert({
    student_id: studentId,
    name,
    subjects,
    usage_tags: usageTags,
    start_date: startDate,
    planned_end_date: plannedEndDate,
    registered_by: actor.userId,
    is_seen_by_student: !isAdminRegistration,
  })

  if (error) {
    return { error: '教材の登録に失敗しました' }
  }

  revalidateTextbookPaths(studentId)
  const unlockedAchievements = await evaluateAndUnlockAchievements(studentId)
  return { success: true, unlockedAchievements }
}

export async function createTextbooksForStudents(
  _prevState: TextbookActionState,
  formData: FormData,
): Promise<TextbookActionState> {
  const actor = await getActorContext()
  if ('error' in actor) return { error: actor.error }
  if (!actor.isAdmin) return { error: '権限がありません' }

  const studentIds = parseStudentIds(formData)
  const catalogId = String(formData.get('catalogId') ?? '').trim()
  const supabase = await createClient()

  if (studentIds.length === 0) {
    return { error: '生徒を1人以上選択してください' }
  }

  let name = String(formData.get('name') ?? '').trim()
  let subjects: string[] = []
  let usageTags = parseUsageTags(formData)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)

  if (catalogId) {
    const { data: catalog } = await supabase
      .from('textbook_catalog')
      .select('name, subjects, usage_tags')
      .eq('id', catalogId)
      .maybeSingle<{ name: string; subjects: string[]; usage_tags: string[] }>()

    if (!catalog) return { error: '本棚の参考書が見つかりません' }

    name = catalog.name
    subjects = catalog.subjects
    if (usageTags.length === 0) {
      usageTags = catalog.usage_tags
    }
  } else {
    subjects = formData
      .getAll('subjects')
      .map((value) => String(value).trim())
      .filter(Boolean)
  }

  if (!name) return { error: '教材名を入力してください' }
  if (subjects.length === 0) return { error: '科目タグを1つ以上指定してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (dateError) return { error: dateError }

  const rows = studentIds.map((studentId) => ({
    student_id: studentId,
    name,
    subjects,
    usage_tags: usageTags,
    start_date: startDate,
    planned_end_date: plannedEndDate,
    catalog_id: catalogId || null,
    registered_by: actor.userId,
    is_seen_by_student: false,
  }))

  const { error } = await supabase.from('textbooks').insert(rows)

  if (error) {
    if (error.code === '23505') {
      return { error: '選択した生徒の中に、既に同じ参考書を登録している生徒がいます' }
    }
    return { error: '教材の登録に失敗しました' }
  }

  revalidateAllStudentPaths(studentIds)
  return { success: true }
}

export async function addTextbookFromCatalog(
  studentId: string,
  _prevState: TextbookActionState,
  formData: FormData,
): Promise<TextbookActionState> {
  const authError = await assertCanManageStudent(studentId)
  if (authError) return { error: authError }

  const actor = await getActorContext()
  if ('error' in actor) return { error: actor.error }

  const catalogId = String(formData.get('catalogId') ?? '').trim()
  if (!catalogId) return { error: '参考書を選択してください' }

  const supabase = await createClient()
  const { data: catalog } = await supabase
    .from('textbook_catalog')
    .select('id, name, subjects, usage_tags, visibility')
    .eq('id', catalogId)
    .maybeSingle<{
      id: string
      name: string
      subjects: string[]
      usage_tags: string[]
      visibility: string
    }>()

  if (!catalog) return { error: '参考書が見つかりません' }

  if (catalog.visibility === 'private') {
    const { data: existingPrivate } = await supabase
      .from('textbooks')
      .select('id')
      .eq('student_id', studentId)
      .eq('catalog_id', catalogId)
      .maybeSingle()

    if (!existingPrivate && !actor.isAdmin) {
      return { error: 'この参考書は非公開のため選択できません' }
    }
  }

  const usageTags = parseUsageTags(formData)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)
  if (dateError) return { error: dateError }

  const finalUsageTags = usageTags.length > 0 ? usageTags : catalog.usage_tags
  if (finalUsageTags.length === 0) {
    return { error: '用途タグを1つ以上選択してください' }
  }

  const { error } = await supabase.from('textbooks').insert({
    student_id: studentId,
    name: catalog.name,
    subjects: catalog.subjects,
    usage_tags: finalUsageTags,
    start_date: startDate,
    planned_end_date: plannedEndDate,
    catalog_id: catalog.id,
    registered_by: actor.userId,
    is_seen_by_student: true,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'この参考書は既に登録されています' }
    }
    return { error: '教材の登録に失敗しました' }
  }

  revalidateTextbookPaths(studentId)
  const unlockedAchievements = await evaluateAndUnlockAchievements(studentId)
  return { success: true, unlockedAchievements }
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
  const usageTags = parseUsageTags(formData)
  const { startDate, plannedEndDate, error: dateError } = parseTextbookDates(formData)

  if (!textbookId) return { error: '教材が指定されていません' }
  if (!name) return { error: '教材名を入力してください' }
  if (subjects.length === 0) return { error: '科目タグを1つ以上選択してください' }
  if (usageTags.length === 0) return { error: '用途タグを1つ以上選択してください' }
  if (dateError) return { error: dateError }

  const { error } = await supabase
    .from('textbooks')
    .update({
      name,
      subjects,
      usage_tags: usageTags,
      start_date: startDate,
      planned_end_date: plannedEndDate,
    })
    .eq('id', textbookId)
    .eq('student_id', studentId)

  if (error) return { error: '教材の更新に失敗しました' }

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

export async function loadTextbooksForAdmin(studentId: string) {
  const authError = await assertCanManageStudent(studentId)
  if (authError) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('textbooks')
    .select('*')
    .eq('student_id', studentId)
    .order('name')

  return (data ?? []).map((book) => ({
    ...book,
    usage_tags: book.usage_tags ?? [],
    is_seen_by_student: book.is_seen_by_student ?? true,
  }))
}
