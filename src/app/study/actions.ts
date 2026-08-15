'use server'

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

async function validateAndResolveStudyLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
) {
  const subject = String(formData.get('subject') ?? '').trim()
  const textbookId = String(formData.get('textbookId') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const durationRaw = String(formData.get('durationMinutes') ?? '').trim()
  const studiedOn = String(formData.get('studiedOn') ?? '').trim()

  if (!subject || !textbookId || !durationRaw || !studiedOn) {
    return { error: '科目・教材・学習時間・学習日は必須です' as const }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('subjects')
    .eq('id', userId)
    .maybeSingle<{ subjects: string[] }>()

  const profileSubjects = profile?.subjects ?? []

  if (!profileSubjects.includes(subject)) {
    return { error: 'プロフィールで選択した科目のみ記録できます' as const }
  }

  const { data: textbook } = await supabase
    .from('textbooks')
    .select('id, name, subjects, student_id')
    .eq('id', textbookId)
    .eq('student_id', userId)
    .maybeSingle<{ id: string; name: string; subjects: string[]; student_id: string }>()

  if (!textbook) {
    return { error: '教材を正しく選択してください' as const }
  }

  if (!textbook.subjects.includes(subject)) {
    return { error: '選択した科目に対応する教材を選んでください' as const }
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
      subject,
      textbook_id: textbook.id,
      textbook_name: textbook.name,
      content,
      duration_minutes: durationMinutes,
      studied_on: studiedOn,
    },
  }
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
  if ('error' in result && result.error) {
    return { error: result.error }
  }

  const { error } = await supabase.from('study_logs').insert({
    student_id: user.id,
    ...result.data!,
  })

  if (error) {
    return { error: '学習記録の保存に失敗しました' }
  }

  revalidatePath('/dashboard/study')
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

  const result = await validateAndResolveStudyLog(supabase, user.id, formData)
  if ('error' in result && result.error) {
    return { error: result.error }
  }

  const { error } = await supabase
    .from('study_logs')
    .update(result.data!)
    .eq('id', logId)
    .eq('student_id', user.id)

  if (error) {
    return { error: '学習記録の更新に失敗しました' }
  }

  revalidatePath('/dashboard/study')
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
  revalidatePath('/dashboard/study/history')
  revalidatePath('/admin/study-daily')
}
