'use server'

import {
  deriveStudyCategoryFromTextbook,
  filterTextbooksByStudyCategory,
  isStudySubjectCategoryLabel,
  profileIncludesStudyCategory,
} from '@/lib/constants/textbook-subject-categories'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getJstDateKey } from '@/lib/study/dates'
import {
  validateStudiedOn,
  validateStudyDurationMinutes,
} from '@/lib/study/validation'

export type StudyLogActionState = {
  error?: string
  success?: boolean
}

type StudyLogRegistrationMode = 'subject' | 'textbook'

type ResolvedStudyLog = {
  subject: string
  textbook_id: string | null
  textbook_name: string
  content: string
  duration_minutes: number
  studied_on: string
}

function parseRegistrationMode(formData: FormData): StudyLogRegistrationMode | null {
  const mode = String(formData.get('registrationMode') ?? '').trim()
  if (mode === 'subject' || mode === 'textbook') return mode
  return null
}

async function validateCommonStudyLogFields(formData: FormData) {
  const content = String(formData.get('content') ?? '').trim()
  const durationRaw = String(formData.get('durationMinutes') ?? '').trim()
  const studiedOn = String(formData.get('studiedOn') ?? '').trim()

  if (!durationRaw || !studiedOn) {
    return { error: '学習時間・学習日は必須です' as const }
  }

  const studiedOnError = validateStudiedOn(studiedOn, getJstDateKey())
  if (studiedOnError) {
    return { error: studiedOnError }
  }

  const durationMinutes = Number(durationRaw)
  const durationError = validateStudyDurationMinutes(durationMinutes)
  if (durationError) {
    return { error: durationError }
  }

  return {
    data: {
      content,
      duration_minutes: durationMinutes,
      studied_on: studiedOn,
    },
  }
}

async function validateSubjectOnlyStudyLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<{ error: string } | { data: ResolvedStudyLog }> {
  const subject = String(formData.get('subject') ?? '').trim()
  if (!subject) {
    return { error: '科目を選択してください' }
  }

  const common = await validateCommonStudyLogFields(formData)
  if ('error' in common && common.error) {
    return { error: common.error }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subjects')
    .eq('id', userId)
    .maybeSingle<{ subjects: string[] }>()

  const profileSubjects = profile?.subjects ?? []

  if (!isStudySubjectCategoryLabel(subject) || !profileIncludesStudyCategory(profileSubjects, subject)) {
    return { error: 'プロフィールで選択した科目のみ記録できます' }
  }

  return {
    data: {
      subject,
      textbook_id: null,
      textbook_name: '',
      ...common.data!,
    },
  }
}

async function validateTextbookStudyLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<{ error: string } | { data: ResolvedStudyLog }> {
  const textbookId = String(formData.get('textbookId') ?? '').trim()
  if (!textbookId) {
    return { error: '参考書を選択してください' }
  }

  const common = await validateCommonStudyLogFields(formData)
  if ('error' in common && common.error) {
    return { error: common.error }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subjects')
    .eq('id', userId)
    .maybeSingle<{ subjects: string[] }>()

  const profileSubjects = profile?.subjects ?? []

  const { data: textbook } = await supabase
    .from('textbooks')
    .select('id, name, subjects, student_id')
    .eq('id', textbookId)
    .eq('student_id', userId)
    .maybeSingle<{ id: string; name: string; subjects: string[]; student_id: string }>()

  if (!textbook) {
    return { error: '参考書を正しく選択してください' }
  }

  const subject = deriveStudyCategoryFromTextbook(textbook.subjects, profileSubjects)
  if (!subject) {
    return { error: '選択した参考書の科目がプロフィールと一致しません' }
  }

  return {
    data: {
      subject,
      textbook_id: textbook.id,
      textbook_name: textbook.name,
      ...common.data!,
    },
  }
}

async function validateAndResolveStudyLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  modeOverride?: StudyLogRegistrationMode,
) {
  const mode = modeOverride ?? parseRegistrationMode(formData)
  if (!mode) {
    return { error: '登録方法が不正です' as const }
  }

  if (mode === 'subject') {
    return validateSubjectOnlyStudyLog(supabase, userId, formData)
  }

  return validateTextbookStudyLog(supabase, userId, formData)
}

export async function createStudyLog(
  _prevState: StudyLogActionState,
  formData: FormData,
): Promise<StudyLogActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインが必要です' }
  }

  const result = await validateAndResolveStudyLog(supabase, user.id, formData)
  if ('error' in result) {
    return { error: result.error }
  }

  const { error } = await supabase.from('study_logs').insert({
    student_id: user.id,
    ...result.data,
  })

  if (error) {
    return { error: '学習記録の保存に失敗しました' }
  }

  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/study/subject')
  revalidatePath('/dashboard/study/textbook')
  revalidatePath('/dashboard/study/history')
  revalidatePath('/admin/students')
  revalidatePath('/admin/study-daily')

  return { success: true }
}

export async function updateStudyLog(
  _prevState: StudyLogActionState,
  formData: FormData,
): Promise<StudyLogActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインが必要です' }
  }

  const logId = String(formData.get('logId') ?? '').trim()
  if (!logId) {
    return { error: '記録が指定されていません' }
  }

  const { data: existingLog } = await supabase
    .from('study_logs')
    .select('textbook_id')
    .eq('id', logId)
    .eq('student_id', user.id)
    .maybeSingle<{ textbook_id: string | null }>()

  if (!existingLog) {
    return { error: '記録が見つかりません' }
  }

  const mode: StudyLogRegistrationMode = existingLog.textbook_id ? 'textbook' : 'subject'
  const result = await validateAndResolveStudyLog(supabase, user.id, formData, mode)
  if ('error' in result) {
    return { error: result.error }
  }

  const { error } = await supabase
    .from('study_logs')
    .update(result.data)
    .eq('id', logId)
    .eq('student_id', user.id)

  if (error) {
    return { error: '学習記録の更新に失敗しました' }
  }

  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/study/subject')
  revalidatePath('/dashboard/study/textbook')
  revalidatePath('/dashboard/study/history')
  revalidatePath('/admin/students')
  revalidatePath('/admin/study-daily')

  return { success: true }
}

export async function deleteStudyLog(formData: FormData): Promise<void> {
  const logId = String(formData.get('logId') ?? '')
  if (!logId) return

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase.from('study_logs').delete().eq('id', logId).eq('student_id', user.id)

  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/study/subject')
  revalidatePath('/dashboard/study/textbook')
  revalidatePath('/dashboard/study/history')
  revalidatePath('/admin/study-daily')
}
