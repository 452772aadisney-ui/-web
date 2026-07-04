'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type TagActionState = {
  error?: string
  success?: boolean
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

function revalidateTagPaths(studentId?: string) {
  revalidatePath('/admin/tags')
  revalidatePath('/admin/announcements')
  if (studentId) {
    revalidatePath(`/admin/students/${studentId}`)
    revalidatePath('/admin/students')
  }
}

export async function createStudentTag(
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const category = String(formData.get('category') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  if (!name) return { error: 'タグ名を入力してください' }

  const supabase = await createClient()
  const { error } = await supabase.from('student_tags').insert({ category, name })

  if (error) return { error: 'タグの作成に失敗しました（重複の可能性があります）' }
  revalidateTagPaths()
  return { success: true }
}

export async function deleteStudentTag(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('student_tags').delete().eq('id', id)
  revalidateTagPaths()
}

export async function updateProfileTags(
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const profileId = String(formData.get('profileId') ?? '').trim()
  if (!profileId) return { error: '生徒が指定されていません' }

  const supabase = await createClient()
  const { data: allTags } = await supabase.from('student_tags').select('id')
  const tagIds = (allTags ?? [])
    .map((t) => t.id as string)
    .filter((tagId) => formData.get(`tag_${tagId}`) === 'on')

  await supabase.from('profile_student_tags').delete().eq('profile_id', profileId)

  if (tagIds.length > 0) {
    const { error } = await supabase.from('profile_student_tags').insert(
      tagIds.map((tagId) => ({ profile_id: profileId, tag_id: tagId })),
    )
    if (error) return { error: 'タグの更新に失敗しました' }
  }

  revalidateTagPaths(profileId)
  revalidatePath('/dashboard')
  return { success: true }
}
