'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'

export type AdminStudentProfileActionState = {
  error?: string
  success?: boolean
}

function parseTargetSchools(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseSubjects(formData: FormData): string[] {
  return EXAM_SUBJECTS.filter((subject) => formData.get(`subject_${subject}`) === 'on')
}

async function assertAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'ログインが必要です'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string }>()

  if (profile?.role !== 'admin') return '管理者権限が必要です'
  return null
}

export async function updateStudentProfileByAdmin(
  _prev: AdminStudentProfileActionState,
  formData: FormData,
): Promise<AdminStudentProfileActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const studentId = String(formData.get('studentId') ?? '').trim()
  const fullName = String(formData.get('fullName') ?? '').trim()
  const birthdayRaw = String(formData.get('birthday') ?? '').trim()
  const targetSchoolsRaw = String(formData.get('targetSchools') ?? '')
  let studentCode = String(formData.get('studentCode') ?? '').trim()
  const subjects = parseSubjects(formData)

  if (!studentId) return { error: '生徒が指定されていません' }
  if (!fullName) return { error: '氏名を入力してください' }

  const supabase = await createClient()

  const { data: student } = await supabase
    .from('profiles')
    .select('id, role, student_code')
    .eq('id', studentId)
    .maybeSingle<{ id: string; role: string; student_code: string | null }>()

  if (!student || student.role !== 'student') {
    return { error: '生徒が見つかりません' }
  }

  if (!studentCode) {
    if (student.student_code) {
      studentCode = student.student_code
    } else {
      const { data: generated, error: rpcError } = await supabase.rpc('generate_student_code')
      if (rpcError || !generated) {
        return { error: '生徒IDの生成に失敗しました' }
      }
      studentCode = String(generated)
    }
  }

  if (!/^[A-Za-z0-9-]+$/.test(studentCode)) {
    return { error: '生徒IDは英数字とハイフンのみ使用できます' }
  }

  const { data: duplicate } = await supabase
    .from('profiles')
    .select('id')
    .eq('student_code', studentCode)
    .neq('id', studentId)
    .maybeSingle()

  if (duplicate) {
    return { error: 'この生徒IDは既に使用されています' }
  }

  const birthday = birthdayRaw || null

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      display_name: fullName,
      birthday,
      target_schools: parseTargetSchools(targetSchoolsRaw),
      subjects,
      student_code: studentCode,
    })
    .eq('id', studentId)

  if (error) {
    return { error: '保存に失敗しました' }
  }

  revalidatePath(`/admin/students/${studentId}`)
  revalidatePath('/admin/students')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard/study')
  revalidatePath('/dashboard/bookshelf')
  return { success: true }
}
