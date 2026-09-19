'use server'

import { revalidatePath } from 'next/cache'
import {
  assertAdminCanAccessStudent,
  requireAdminAccess,
  requireSuperAdminAccess,
} from '@/lib/auth/admin-access'
import { KISOTSU_GRADE_TAG } from '@/lib/tags/grade-order'
import { createClient } from '@/lib/supabase/server'

export type TagActionState = {
  error?: string
  success?: boolean
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
  const access = await requireAdminAccess()
  if (!access.ok) return { error: access.error }

  const category = String(formData.get('category') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  if (!name) return { error: 'タグ名を入力してください' }

  if (category === '学年' && name === KISOTSU_GRADE_TAG && !access.isSuperAdmin) {
    return { error: '既卒タグの作成は大管理者のみ可能です' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('student_tags').insert({ category, name })

  if (error) return { error: 'タグの作成に失敗しました（重複の可能性があります）' }
  revalidateTagPaths()
  return { success: true }
}

export async function deleteStudentTag(formData: FormData): Promise<void> {
  const access = await requireAdminAccess()
  if (!access.ok) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  if (!access.isSuperAdmin) {
    const { data: tag } = await supabase
      .from('student_tags')
      .select('category, name')
      .eq('id', id)
      .maybeSingle<{ category: string; name: string }>()
    if (tag?.category === '学年' && tag.name === KISOTSU_GRADE_TAG) return
  }

  await supabase.from('student_tags').delete().eq('id', id)
  revalidateTagPaths()
}

export async function updateProfileTags(
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const access = await requireAdminAccess()
  if (!access.ok) return { error: access.error }

  const profileId = String(formData.get('profileId') ?? '').trim()
  if (!profileId) return { error: '生徒が指定されていません' }

  const canAccess = await assertAdminCanAccessStudent(profileId, access)
  if (!canAccess.ok) return { error: canAccess.error }

  const supabase = await createClient()
  const { data: allTags } = await supabase
    .from('student_tags')
    .select('id, category, name')

  const kisotsuTag = (allTags ?? []).find(
    (t) => t.category === '学年' && t.name === KISOTSU_GRADE_TAG,
  )

  const selectedIds = (allTags ?? [])
    .map((t) => t.id as string)
    .filter((tagId) => formData.get(`tag_${tagId}`) === 'on')

  const { data: current } = await supabase
    .from('profile_student_tags')
    .select('tag_id')
    .eq('profile_id', profileId)

  const currentIds = new Set((current ?? []).map((r) => r.tag_id as string))
  const nextIds = new Set(selectedIds)

  if (kisotsuTag) {
    const had = currentIds.has(kisotsuTag.id)
    const willHave = nextIds.has(kisotsuTag.id)
    if (had !== willHave && !access.isSuperAdmin) {
      return { error: '既卒タグの付与・解除は大管理者のみ可能です' }
    }
  }

  if (!access.isSuperAdmin && kisotsuTag && currentIds.has(kisotsuTag.id)) {
    nextIds.add(kisotsuTag.id)
  }

  await supabase.from('profile_student_tags').delete().eq('profile_id', profileId)

  if (nextIds.size > 0) {
    const { error } = await supabase.from('profile_student_tags').insert(
      [...nextIds].map((tagId) => ({ profile_id: profileId, tag_id: tagId })),
    )
    if (error) return { error: 'タグの更新に失敗しました' }
  }

  revalidateTagPaths(profileId)
  revalidatePath('/dashboard')
  return { success: true }
}
