'use server'

import { revalidatePath } from 'next/cache'
import { evaluateAndUnlockAchievements, type UnlockedAchievement } from '@/lib/achievements/unlock'
import { notifyStudentsOfNewAnnouncement } from '@/lib/email/notifications'
import { createClient } from '@/lib/supabase/server'

export type AnnouncementActionState = {
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

function revalidateAnnouncementPaths() {
  revalidatePath('/admin/announcements')
  revalidatePath('/dashboard/announcements')
  revalidatePath('/dashboard')
}

function parseTargeting(formData: FormData): {
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
  error?: string
} {
  const targetAll = formData.get('targetAll') === 'on'
  const tagIds = formData.getAll('targetTagIds').map(String).filter(Boolean)
  const studentIds = formData.getAll('targetStudentIds').map(String).filter(Boolean)

  if (!targetAll && tagIds.length === 0 && studentIds.length === 0) {
    return {
      targetAll: false,
      tagIds: [],
      studentIds: [],
      error: '全員配信にするか、タグまたは生徒を1つ以上指定してください',
    }
  }

  return { targetAll, tagIds, studentIds }
}

async function saveAnnouncementTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  announcementId: string,
  targetAll: boolean,
  tagIds: string[],
  studentIds: string[],
) {
  await supabase.from('announcement_target_tags').delete().eq('announcement_id', announcementId)
  await supabase.from('announcement_target_students').delete().eq('announcement_id', announcementId)

  if (targetAll) return

  if (tagIds.length > 0) {
    await supabase.from('announcement_target_tags').insert(
      tagIds.map((tagId) => ({ announcement_id: announcementId, tag_id: tagId })),
    )
  }

  if (studentIds.length > 0) {
    await supabase.from('announcement_target_students').insert(
      studentIds.map((studentId) => ({
        announcement_id: announcementId,
        student_id: studentId,
      })),
    )
  }
}

export async function createAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const { targetAll, tagIds, studentIds, error: targetError } = parseTargeting(formData)

  if (!title) return { error: 'タイトルを入力してください' }
  if (!body) return { error: '本文を入力してください' }
  if (targetError) return { error: targetError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: created, error } = await supabase
    .from('announcements')
    .insert({
      title,
      body,
      created_by: user?.id ?? null,
      target_all: targetAll,
    })
    .select('id')
    .single()

  if (error || !created) return { error: '投稿に失敗しました' }

  await saveAnnouncementTargets(supabase, created.id, targetAll, tagIds, studentIds)

  try {
    await notifyStudentsOfNewAnnouncement({
      announcementId: created.id,
      title,
      targetAll,
      tagIds,
      studentIds,
    })
  } catch (error) {
    console.error('[announcements] email notification failed:', error)
  }

  revalidateAnnouncementPaths()
  return { success: true }
}

export async function updateAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const authError = await assertAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const { targetAll, tagIds, studentIds, error: targetError } = parseTargeting(formData)

  if (!id || !title || !body) return { error: '必須項目を入力してください' }
  if (targetError) return { error: targetError }

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ title, body, target_all: targetAll })
    .eq('id', id)

  if (error) return { error: '更新に失敗しました' }

  await saveAnnouncementTargets(supabase, id, targetAll, tagIds, studentIds)

  revalidateAnnouncementPaths()
  revalidatePath(`/dashboard/announcements/${id}`)
  return { success: true }
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  if (await assertAdmin()) return
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('announcements').delete().eq('id', id)
  revalidateAnnouncementPaths()
}

export async function markAnnouncementAsRead(announcementId: string): Promise<UnlockedAchievement[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !announcementId) return []

  const { data: existingRead } = await supabase
    .from('announcement_reads')
    .select('student_id')
    .eq('student_id', user.id)
    .eq('announcement_id', announcementId)
    .maybeSingle()

  if (existingRead) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  await supabase.from('announcement_reads').upsert(
    {
      student_id: user.id,
      announcement_id: announcementId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,announcement_id' },
  )

  revalidatePath('/dashboard/announcements')
  revalidatePath(`/dashboard/announcements/${announcementId}`)
  revalidatePath('/admin/announcements')
  revalidatePath('/dashboard')

  if (profile?.role !== 'student') return []

  return evaluateAndUnlockAchievements(user.id)
}
